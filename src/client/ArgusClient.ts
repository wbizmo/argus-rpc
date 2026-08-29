import net from "node:net";
import { ArgusError } from "../errors";
import {
  ArgusMessageType,
  assertFrameAllowedFromPeer,
  createFrame,
  encodeFrame,
  parsePayload,
  serializePayload,
  type ArgusProtocolLimits
} from "../protocol";
import { ArgusFrameStreamDecoder, SocketWriter } from "../transport";
import { withRetry, type RetryOptions } from "./retry";

export interface ArgusClientOptions {
  host?: string;
  port: number;
  timeoutMs?: number;
  retry?: RetryOptions;
  protocolLimits?: Partial<ArgusProtocolLimits>;
  maxQueuedWriteBytes?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

export class ArgusClient {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly retry?: RetryOptions;
  private readonly protocolLimits?: Partial<ArgusProtocolLimits>;
  private readonly maxQueuedWriteBytes?: number;
  private socket: net.Socket | null = null;
  private writer: SocketWriter | null = null;
  private decoder: ArgusFrameStreamDecoder | null = null;
  private connectPromise: Promise<void> | null = null;
  private nextMessageId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(options: ArgusClientOptions) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.retry = options.retry;
    this.protocolLimits = options.protocolLimits;
    this.maxQueuedWriteBytes = options.maxQueuedWriteBytes;
  }

  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed && !this.socket.connecting) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.openSocket();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  async call<TResponse = unknown>(
    method: string,
    payload?: unknown,
    timeoutMs = this.timeoutMs
  ): Promise<TResponse> {
    if (!this.retry) {
      return this.callOnce<TResponse>(method, payload, timeoutMs);
    }

    return withRetry(
      async () => this.callOnce<TResponse>(method, payload, timeoutMs),
      this.retry
    );
  }

  async callOnce<TResponse = unknown>(
    method: string,
    payload?: unknown,
    timeoutMs = this.timeoutMs
  ): Promise<TResponse> {
    await this.connect();

    const writer = this.getWriter();
    const messageId = this.nextMessageId++;
    const encoded = encodeFrame(createFrame({
      type: ArgusMessageType.REQUEST,
      messageId,
      method,
      payload: serializePayload(payload)
    }), this.protocolLimits);

    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        reject(new ArgusError({
          code: "ARGUS_REQUEST_TIMEOUT",
          message: `Argus request timed out after ${timeoutMs}ms`,
          details: { method, messageId, timeoutMs }
        }));
      }, timeoutMs);

      this.pending.set(messageId, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        timer
      });

      void writer.write(encoded).catch((error: Error) => {
        const pending = this.pending.get(messageId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(messageId);
        pending.reject(error);
      });
    });
  }

  async ping(timeoutMs = this.timeoutMs): Promise<boolean> {
    await this.connect();

    const writer = this.getWriter();
    const messageId = this.nextMessageId++;
    const encoded = encodeFrame(createFrame({
      type: ArgusMessageType.PING,
      messageId,
      method: "",
      payload: null
    }), this.protocolLimits);

    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        reject(new ArgusError({
          code: "ARGUS_PING_TIMEOUT",
          message: `Argus ping timed out after ${timeoutMs}ms`
        }));
      }, timeoutMs);

      this.pending.set(messageId, {
        resolve: () => resolve(true),
        reject,
        timer
      });

      void writer.write(encoded).catch((error: Error) => {
        const pending = this.pending.get(messageId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(messageId);
        pending.reject(error);
      });
    });
  }

  async close(): Promise<void> {
    this.rejectAll(new ArgusError({
      code: "ARGUS_CLIENT_CLOSED",
      message: "Argus client closed"
    }));

    const socket = this.socket;
    this.socket = null;
    this.decoder?.reset();
    this.decoder = null;
    this.writer?.close();
    this.writer = null;

    if (!socket || socket.destroyed) {
      return;
    }

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.end();
      socket.destroy();
    });
  }

  private async openSocket(): Promise<void> {
    const socket = net.createConnection({ host: this.host, port: this.port });
    const decoder = new ArgusFrameStreamDecoder(this.protocolLimits);
    const writer = new SocketWriter(socket, {
      maxQueuedBytes: this.maxQueuedWriteBytes
    });

    this.socket = socket;
    this.decoder = decoder;
    this.writer = writer;

    socket.on("data", (chunk: Buffer) => {
      try {
        const frames = decoder.push(chunk);
        for (const frame of frames) {
          assertFrameAllowedFromPeer("client", frame);
          this.handleFrame(frame);
        }
      } catch (error) {
        const argusError = ArgusError.fromUnknown(error, "ARGUS_INVALID_SERVER_FRAME");
        this.rejectAll(argusError);
        socket.destroy(argusError);
      }
    });

    socket.on("error", (error) => {
      this.rejectAll(error);
    });

    socket.on("close", () => {
      writer.close();
      decoder.reset();
      this.rejectAll(new ArgusError({
        code: "ARGUS_CONNECTION_CLOSED",
        message: "Argus connection closed"
      }));
      if (this.socket === socket) {
        this.socket = null;
        this.writer = null;
        this.decoder = null;
      }
    });

    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        socket.off("error", onConnectError);
        resolve();
      };
      const onConnectError = (error: Error) => {
        socket.off("connect", onConnect);
        reject(error);
      };
      socket.once("connect", onConnect);
      socket.once("error", onConnectError);
    });
  }

  private handleFrame(frame: {
    type: ArgusMessageType;
    messageId: number;
    payload: Buffer;
  }): void {
    const pending = this.pending.get(frame.messageId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(frame.messageId);

    if (frame.type === ArgusMessageType.PONG) {
      pending.resolve(true);
      return;
    }

    const payload = parsePayload(frame.payload);

    if (frame.type === ArgusMessageType.ERROR) {
      const errorPayload = payload as {
        code?: string;
        message?: string;
        details?: unknown;
      } | undefined;

      pending.reject(new ArgusError({
        code: errorPayload?.code ?? "ARGUS_REMOTE_ERROR",
        message: errorPayload?.message ?? "Argus remote error",
        details: errorPayload?.details
      }));
      return;
    }

    pending.resolve(payload);
  }

  private getWriter(): SocketWriter {
    if (!this.socket || this.socket.destroyed || !this.writer) {
      throw new ArgusError({
        code: "ARGUS_CLIENT_NOT_CONNECTED",
        message: "Argus client is not connected"
      });
    }
    return this.writer;
  }

  private rejectAll(error: Error): void {
    for (const [messageId, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(messageId);
    }
  }
}
