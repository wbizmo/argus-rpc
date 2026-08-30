import net from "node:net";
import { ConnectionManager } from "../connection";
import { ArgusError } from "../errors";
import { ArgusMetrics } from "../observability";
import {
  ArgusMessageType,
  assertFrameAllowedFromPeer,
  createFrame,
  encodeFrame,
  serializePayload,
  type ArgusFrame,
  type ArgusProtocolLimits
} from "../protocol";
import {
  ArgusStatus,
  composeServerInterceptors,
  decodeRequestEnvelope,
  type ArgusCallContext,
  type ArgusServerInterceptor,
  type ArgusServerNext
} from "../rpc";
import { ArgusFrameStreamDecoder, SocketWriter } from "../transport";
import { ConcurrencyLimiter } from "./concurrency-limiter";
import { MethodRegistry, type ArgusMethodHandler } from "./method-registry";

export interface ArgusServerOptions {
  maxConcurrentCalls?: number;
  maxQueuedCalls?: number;
  maxQueuedWriteBytes?: number;
  protocolLimits?: Partial<ArgusProtocolLimits>;
  interceptors?: readonly ArgusServerInterceptor[];
  metrics?: ArgusMetrics;
  /**
   * Argus TCP transport is plaintext. Remote binds are refused by default.
   * Set this only when transport encryption/authentication is provided by a
   * trusted outer layer such as TLS termination, WireGuard, or a service mesh.
   */
  allowInsecureRemote?: boolean;
}

export interface ArgusServerStats {
  connections: number;
  methods: number;
  activeCalls: number;
  queuedCalls: number;
}

export class ArgusServer {
  private readonly registry = new MethodRegistry();
  private readonly connections = new ConnectionManager();
  private readonly limiter: ConcurrencyLimiter;
  private readonly options: ArgusServerOptions;
  private readonly executeHandler: ArgusServerNext;
  private readonly metricsCollector: ArgusMetrics;
  private server: net.Server | null = null;

  constructor(options: ArgusServerOptions = {}) {
    this.options = options;
    this.metricsCollector = options.metrics ?? new ArgusMetrics();
    this.limiter = new ConcurrencyLimiter({
      maxConcurrent: options.maxConcurrentCalls,
      maxQueued: options.maxQueuedCalls
    });
    this.executeHandler = composeServerInterceptors(
      options.interceptors ?? [],
      (payload, context) => this.registry.execute(context.method, payload, context)
    );
  }

  method(name: string, handler: ArgusMethodHandler): this {
    this.registry.register(name, handler);
    return this;
  }

  methods(): string[] {
    return this.registry.list();
  }

  stats(): ArgusServerStats {
    return {
      connections: this.connections.count(),
      methods: this.registry.list().length,
      activeCalls: this.limiter.active,
      queuedCalls: this.limiter.queued
    };
  }

  metricsSnapshot(): ReturnType<ArgusMetrics["snapshot"]> {
    this.syncRuntimeGauges();
    return this.metricsCollector.snapshot();
  }

  async listen(port = 0, host = "127.0.0.1"): Promise<number> {
    if (this.server) {
      throw new ArgusError({
        code: "ARGUS_SERVER_ALREADY_LISTENING",
        message: "Argus server is already listening"
      });
    }

    if (!isLoopbackHost(host) && !this.options.allowInsecureRemote) {
      throw new ArgusError({
        code: "ARGUS_INSECURE_REMOTE_BIND",
        message: "Argus uses a plaintext TCP transport and refuses non-loopback binds by default. Provide transport encryption/authentication externally and set allowInsecureRemote: true only when that boundary is in place."
      });
    }

    this.server = net.createServer((socket) => this.handleSocket(socket));

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server?.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server?.off("error", onError);
        resolve();
      };
      this.server?.once("error", onError);
      this.server?.once("listening", onListening);
      this.server?.listen(port, host);
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new ArgusError({
        code: "ARGUS_INVALID_SERVER_ADDRESS",
        message: "Argus server could not resolve a valid listening address"
      });
    }
    return address.port;
  }

  async close(): Promise<void> {
    this.connections.destroyAll();
    if (!this.server) return;

    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  private handleSocket(socket: net.Socket): void {
    this.connections.add(socket);
    this.metricsCollector.increment("connections.opened");
    this.syncRuntimeGauges();

    const decoder = new ArgusFrameStreamDecoder(this.options.protocolLimits);
    const writer = new SocketWriter(socket, {
      maxQueuedBytes: this.options.maxQueuedWriteBytes
    });
    const calls = new Map<number, AbortController>();

    socket.once("close", () => {
      for (const controller of calls.values()) {
        controller.abort(new ArgusError({
          code: "ARGUS_CONNECTION_CLOSED",
          message: "Connection closed while RPC was active",
          status: ArgusStatus.UNAVAILABLE
        }));
      }
      calls.clear();
      decoder.reset();
      writer.close();
      this.metricsCollector.increment("connections.closed");
      this.syncRuntimeGauges();
    });

    socket.on("data", (chunk: Buffer) => {
      this.metricsCollector.increment("transport.bytes.received", chunk.length);
      try {
        const frames = decoder.push(chunk);
        this.metricsCollector.increment("transport.frames.received", frames.length);
        for (const frame of frames) {
          assertFrameAllowedFromPeer("server", frame);
          void this.handleFrame(socket, writer, calls, frame).catch(() => socket.destroy());
        }
      } catch (error) {
        this.metricsCollector.increment("transport.frames.invalid");
        const argusError = ArgusError.fromUnknown(error, "ARGUS_INVALID_FRAME");
        void this.writeError(writer, 0, "", argusError).finally(() => socket.destroy());
      }
    });
  }

  private async handleFrame(
    socket: net.Socket,
    writer: SocketWriter,
    calls: Map<number, AbortController>,
    frame: ArgusFrame
  ): Promise<void> {
    if (frame.type === ArgusMessageType.PING) {
      this.metricsCollector.increment("keepalive.pings.received");
      await this.writeFrame(writer, createFrame({
        type: ArgusMessageType.PONG,
        messageId: frame.messageId,
        method: "",
        payload: null
      }));
      return;
    }

    if (frame.type === ArgusMessageType.CANCEL) {
      this.metricsCollector.increment("rpc.cancellations.received");
      calls.get(frame.messageId)?.abort(new ArgusError({
        code: "ARGUS_CALL_CANCELLED",
        message: "Argus call cancelled by peer",
        status: ArgusStatus.CANCELLED
      }));
      return;
    }

    if (calls.has(frame.messageId)) {
      this.metricsCollector.increment("rpc.duplicate_message_ids");
      await this.writeError(writer, frame.messageId, frame.method, new ArgusError({
        code: "ARGUS_DUPLICATE_MESSAGE_ID",
        message: "A call with this message id is already active",
        status: ArgusStatus.INVALID_ARGUMENT
      }));
      return;
    }

    const controller = new AbortController();
    calls.set(frame.messageId, controller);
    this.metricsCollector.increment("rpc.calls.started");
    const callStartedAt = Date.now();

    try {
      await this.limiter.run(async () => {
        this.syncRuntimeGauges();
        const request = decodeRequestEnvelope(frame.payload);
        let deadlineTimer: NodeJS.Timeout | undefined;

        if (request.deadlineUnixMs !== undefined) {
          const remaining = request.deadlineUnixMs - Date.now();
          if (remaining <= 0) {
            throw new ArgusError({
              code: "ARGUS_DEADLINE_EXCEEDED",
              message: "Argus request deadline expired before execution",
              status: ArgusStatus.DEADLINE_EXCEEDED
            });
          }
          deadlineTimer = setTimeout(() => {
            controller.abort(new ArgusError({
              code: "ARGUS_DEADLINE_EXCEEDED",
              message: "Argus request deadline exceeded",
              status: ArgusStatus.DEADLINE_EXCEEDED
            }));
          }, remaining);
        }

        const context: ArgusCallContext = {
          messageId: frame.messageId,
          method: frame.method,
          peer: { address: socket.remoteAddress, port: socket.remotePort },
          startedAt: Date.now(),
          deadlineUnixMs: request.deadlineUnixMs,
          metadata: request.metadata,
          signal: controller.signal
        };

        try {
          const result = await executeAbortable(
            this.executeHandler(request.payload, context),
            controller.signal
          );
          await this.writeFrame(writer, createFrame({
            type: ArgusMessageType.RESPONSE,
            messageId: frame.messageId,
            method: frame.method,
            payload: serializePayload(result)
          }));
          this.metricsCollector.increment("rpc.calls.completed");
        } finally {
          if (deadlineTimer) clearTimeout(deadlineTimer);
        }
      });
    } catch (error) {
      const argusError = ArgusError.fromUnknown(error, "ARGUS_HANDLER_ERROR");
      this.metricsCollector.increment("rpc.calls.failed");
      this.metricsCollector.increment(`rpc.status.${argusError.status.toLowerCase()}`);
      await this.writeError(writer, frame.messageId, frame.method, argusError);
    } finally {
      this.metricsCollector.observe("rpc.server.duration_ms", Date.now() - callStartedAt);
      if (calls.get(frame.messageId) === controller) calls.delete(frame.messageId);
      this.syncRuntimeGauges();
    }
  }

  private async writeError(
    writer: SocketWriter,
    messageId: number,
    method: string,
    error: ArgusError
  ): Promise<void> {
    await this.writeFrame(writer, createFrame({
      type: ArgusMessageType.ERROR,
      messageId,
      method,
      payload: error.toJSON()
    }));
  }

  private async writeFrame(writer: SocketWriter, frame: ArgusFrame): Promise<void> {
    const encoded = encodeFrame(frame, this.options.protocolLimits);
    await writer.write(encoded);
    this.metricsCollector.increment("transport.frames.sent");
    this.metricsCollector.increment("transport.bytes.sent", encoded.length);
  }

  private syncRuntimeGauges(): void {
    this.metricsCollector.gauge("connections.active", this.connections.count());
    this.metricsCollector.gauge("rpc.calls.active", this.limiter.active);
    this.metricsCollector.gauge("rpc.calls.queued", this.limiter.queued);
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }
  const match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) && octets[0] === 127;
}

async function executeAbortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortReason(signal);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new ArgusError({
      code: "ARGUS_CALL_CANCELLED",
      message: "Argus call cancelled",
      status: ArgusStatus.CANCELLED
    });
}
