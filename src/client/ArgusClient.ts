import net from "node:net";
import { ArgusError } from "../errors";
import {
  ArgusMessageType,
  createFrame,
  decodeFrames,
  encodeFrame
} from "../protocol";
import { parsePayload, serializePayload } from "../protocol/json";

export interface ArgusClientOptions {
  host?: string;
  port: number;
  timeoutMs?: number;
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
  private socket: net.Socket | null = null;
  private pendingBuffer = Buffer.alloc(0);
  private nextMessageId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(options: ArgusClientOptions) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port;
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }

    this.socket = net.createConnection({
      host: this.host,
      port: this.port
    });

    this.socket.on("data", (chunk: Buffer) => {
      this.handleData(chunk);
    });

    this.socket.on("error", (error) => {
      this.rejectAll(error);
    });

    this.socket.on("close", () => {
      this.rejectAll(
        new ArgusError({
          code: "ARGUS_CONNECTION_CLOSED",
          message: "Argus connection closed"
        })
      );
    });

    await new Promise<void>((resolve, reject) => {
      const socket = this.socket;

      if (!socket) {
        reject(
          new ArgusError({
            code: "ARGUS_SOCKET_NOT_CREATED",
            message: "Argus socket could not be created"
          })
        );
        return;
      }

      const onConnect = () => {
        socket.off("error", onError);
        resolve();
      };

      const onError = (error: Error) => {
        socket.off("connect", onConnect);
        reject(error);
      };

      socket.once("connect", onConnect);
      socket.once("error", onError);
    });
  }

  async call<TResponse = unknown>(
    method: string,
    payload?: unknown,
    timeoutMs = this.timeoutMs
  ): Promise<TResponse> {
    await this.connect();

    const socket = this.getSocket();
    const messageId = this.nextMessageId++;

    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId,
      method,
      payload: serializePayload(payload)
    });

    const encoded = encodeFrame(frame);

    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        reject(
          new ArgusError({
            code: "ARGUS_REQUEST_TIMEOUT",
            message: `Argus request timed out after ${timeoutMs}ms`,
            details: {
              method,
              messageId,
              timeoutMs
            }
          })
        );
      }, timeoutMs);

      this.pending.set(messageId, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        timer
      });

      socket.write(encoded);
    });
  }

  async ping(timeoutMs = this.timeoutMs): Promise<boolean> {
    await this.connect();

    const socket = this.getSocket();
    const messageId = this.nextMessageId++;

    const frame = createFrame({
      type: ArgusMessageType.PING,
      messageId,
      method: "",
      payload: null
    });

    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        reject(
          new ArgusError({
            code: "ARGUS_PING_TIMEOUT",
            message: `Argus ping timed out after ${timeoutMs}ms`
          })
        );
      }, timeoutMs);

      this.pending.set(messageId, {
        resolve: () => resolve(true),
        reject,
        timer
      });

      socket.write(encodeFrame(frame));
    });
  }

  async close(): Promise<void> {
    this.rejectAll(
      new ArgusError({
        code: "ARGUS_CLIENT_CLOSED",
        message: "Argus client closed"
      })
    );

    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.end();
      socket.destroy();
    });
  }

  private handleData(chunk: Buffer): void {
    const incoming = Buffer.from(chunk);
    this.pendingBuffer = Buffer.concat([this.pendingBuffer, incoming]);

    const result = decodeFrames(this.pendingBuffer);
    this.pendingBuffer = Buffer.from(result.remaining);

    for (const frame of result.frames) {
      const pending = this.pending.get(frame.messageId);

      if (!pending) {
        continue;
      }

      clearTimeout(pending.timer);
      this.pending.delete(frame.messageId);

      if (frame.type === ArgusMessageType.PONG) {
        pending.resolve(true);
        continue;
      }

      const payload = parsePayload(frame.payload);

      if (frame.type === ArgusMessageType.ERROR) {
        const errorPayload = payload as { code?: string; message?: string; details?: unknown } | undefined;

        pending.reject(
          new ArgusError({
            code: errorPayload?.code ?? "ARGUS_REMOTE_ERROR",
            message: errorPayload?.message ?? "Argus remote error",
            details: errorPayload?.details
          })
        );
        continue;
      }

      pending.resolve(payload);
    }
  }

  private getSocket(): net.Socket {
    if (!this.socket || this.socket.destroyed) {
      throw new ArgusError({
        code: "ARGUS_CLIENT_NOT_CONNECTED",
        message: "Argus client is not connected"
      });
    }

    return this.socket;
  }

  private rejectAll(error: Error): void {
    for (const [messageId, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(messageId);
    }
  }
}
