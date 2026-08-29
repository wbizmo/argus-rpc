import net from "node:net";
import { ArgusError } from "../errors";
import {
  ArgusMessageType,
  assertFrameAllowedFromPeer,
  createFrame,
  encodeFrame,
  parsePayload,
  type ArgusProtocolLimits
} from "../protocol";
import {
  ArgusStatus,
  encodeRequestEnvelope,
  type ArgusMetadata
} from "../rpc";
import { ArgusFrameStreamDecoder, SocketWriter } from "../transport";
import { MessageIdAllocator } from "./message-id";
import { withRetry, type RetryOptions } from "./retry";

export interface ArgusClientOptions {
  host?: string;
  port: number;
  timeoutMs?: number;
  retry?: RetryOptions;
  protocolLimits?: Partial<ArgusProtocolLimits>;
  maxQueuedWriteBytes?: number;
}

export interface ArgusCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  metadata?: ArgusMetadata;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  cleanup: () => void;
}

export class ArgusClient {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly retry?: RetryOptions;
  private readonly protocolLimits?: Partial<ArgusProtocolLimits>;
  private readonly maxQueuedWriteBytes?: number;
  private readonly messageIds = new MessageIdAllocator();
  private socket: net.Socket | null = null;
  private writer: SocketWriter | null = null;
  private decoder: ArgusFrameStreamDecoder | null = null;
  private connectPromise: Promise<void> | null = null;
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
    if (this.socket && !this.socket.destroyed && !this.socket.connecting) return;
    if (this.connectPromise) return this.connectPromise;

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
    return this.callWithOptions<TResponse>(method, payload, { timeoutMs });
  }

  async callWithOptions<TResponse = unknown>(
    method: string,
    payload?: unknown,
    options: ArgusCallOptions = {}
  ): Promise<TResponse> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const deadlineUnixMs = Date.now() + timeoutMs;
    const operation = async (): Promise<TResponse> => {
      const remainingMs = deadlineUnixMs - Date.now();
      if (remainingMs <= 0) {
        throw deadlineError(method, timeoutMs);
      }
      return this.callOnceInternal<TResponse>(method, payload, {
        timeoutMs: remainingMs,
        deadlineUnixMs,
        signal: options.signal,
        metadata: options.metadata
      });
    };

    if (!this.retry) return operation();

    return withRetry(async () => operation(), {
      ...this.retry,
      maxElapsedMs: Math.min(this.retry.maxElapsedMs ?? timeoutMs, timeoutMs)
    });
  }

  async callOnce<TResponse = unknown>(
    method: string,
    payload?: unknown,
    timeoutMs = this.timeoutMs
  ): Promise<TResponse> {
    return this.callOnceInternal<TResponse>(method, payload, {
      timeoutMs,
      deadlineUnixMs: Date.now() + timeoutMs
    });
  }

  async ping(timeoutMs = this.timeoutMs): Promise<boolean> {
    await this.connect();
    const writer = this.getWriter();
    const messageId = this.allocateMessageId();
    const encoded = encodeFrame(createFrame({
      type: ArgusMessageType.PING,
      messageId,
      method: "",
      payload: null
    }), this.protocolLimits);

    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(messageId);
        if (!pending) return;
        this.pending.delete(messageId);
        pending.cleanup();
        reject(new ArgusError({
          code: "ARGUS_PING_TIMEOUT",
          message: `Argus ping timed out after ${timeoutMs}ms`
        }));
      }, timeoutMs);

      this.pending.set(messageId, {
        resolve: () => resolve(true),
        reject,
        timer,
        cleanup: () => undefined
      });

      void writer.write(encoded).catch((error: Error) => this.failPendingWrite(messageId, error));
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

    if (!socket || socket.destroyed) return;

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.end();
      socket.destroy();
    });
  }

  private async callOnceInternal<TResponse>(
    method: string,
    payload: unknown,
    options: {
      timeoutMs: number;
      deadlineUnixMs: number;
      signal?: AbortSignal;
      metadata?: ArgusMetadata;
    }
  ): Promise<TResponse> {
    if (options.signal?.aborted) {
      throw cancellationError(method, options.signal.reason);
    }

    await this.connect();
    const writer = this.getWriter();
    const messageId = this.allocateMessageId();
    const encoded = encodeFrame(createFrame({
      type: ArgusMessageType.REQUEST,
      messageId,
      method,
      payload: encodeRequestEnvelope(payload, {
        deadlineUnixMs: options.deadlineUnixMs,
        metadata: options.metadata
      })
    }), this.protocolLimits);

    return new Promise<TResponse>((resolve, reject) => {
      const cancel = (): void => {
        const pending = this.pending.get(messageId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(messageId);
        pending.cleanup();
        void this.sendCancel(messageId);
        reject(cancellationError(method, options.signal?.reason));
      };

      const timer = setTimeout(() => {
        const pending = this.pending.get(messageId);
        if (!pending) return;
        this.pending.delete(messageId);
        pending.cleanup();
        void this.sendCancel(messageId);
        reject(deadlineError(method, options.timeoutMs));
      }, options.timeoutMs);

      const cleanup = (): void => {
        options.signal?.removeEventListener("abort", cancel);
      };

      this.pending.set(messageId, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        timer,
        cleanup
      });
      options.signal?.addEventListener("abort", cancel, { once: true });

      void writer.write(encoded).catch((error: Error) => this.failPendingWrite(messageId, error));
    });
  }

  private async sendCancel(messageId: number): Promise<void> {
    const writer = this.writer;
    if (!writer || !this.socket || this.socket.destroyed) return;
    try {
      await writer.write(encodeFrame(createFrame({
        type: ArgusMessageType.CANCEL,
        messageId,
        method: "",
        payload: null
      }), this.protocolLimits));
    } catch {
      // Cancellation is best-effort once the local call has already settled.
    }
  }

  private async openSocket(): Promise<void> {
    const socket = net.createConnection({ host: this.host, port: this.port });
    const decoder = new ArgusFrameStreamDecoder(this.protocolLimits);
    const writer = new SocketWriter(socket, { maxQueuedBytes: this.maxQueuedWriteBytes });

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

    socket.on("error", (error) => this.rejectAll(error));

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
    pending.cleanup();
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
        status?: string;
        retryable?: boolean;
        details?: unknown;
      } | undefined;
      const status = Object.values(ArgusStatus).includes(errorPayload?.status as ArgusStatus)
        ? errorPayload?.status as ArgusStatus
        : ArgusStatus.UNKNOWN;

      pending.reject(new ArgusError({
        code: errorPayload?.code ?? "ARGUS_REMOTE_ERROR",
        message: errorPayload?.message ?? "Argus remote error",
        status,
        retryable: errorPayload?.retryable,
        details: errorPayload?.details
      }));
      return;
    }

    pending.resolve(payload);
  }

  private failPendingWrite(messageId: number, error: Error): void {
    const pending = this.pending.get(messageId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.cleanup();
    this.pending.delete(messageId);
    pending.reject(error);
  }

  private allocateMessageId(): number {
    return this.messageIds.allocate(new Set(this.pending.keys()));
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
      pending.cleanup();
      pending.reject(error);
      this.pending.delete(messageId);
    }
  }
}

function deadlineError(method: string, timeoutMs: number): ArgusError {
  return new ArgusError({
    code: "ARGUS_DEADLINE_EXCEEDED",
    message: `Argus request ${method} exceeded its ${Math.max(0, Math.round(timeoutMs))}ms deadline`,
    status: ArgusStatus.DEADLINE_EXCEEDED,
    retryable: false
  });
}

function cancellationError(method: string, reason: unknown): ArgusError {
  return new ArgusError({
    code: "ARGUS_CALL_CANCELLED",
    message: `Argus request ${method} was cancelled`,
    status: ArgusStatus.CANCELLED,
    retryable: false,
    details: reason
  });
}
