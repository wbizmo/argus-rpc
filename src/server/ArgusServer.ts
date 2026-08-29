import net from "node:net";
import { ConnectionManager } from "../connection";
import { ArgusError } from "../errors";
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
  decodeRequestEnvelope,
  type ArgusCallContext
} from "../rpc";
import { ArgusFrameStreamDecoder, SocketWriter } from "../transport";
import { ConcurrencyLimiter } from "./concurrency-limiter";
import { MethodRegistry, type ArgusMethodHandler } from "./method-registry";

export interface ArgusServerOptions {
  maxConcurrentCalls?: number;
  maxQueuedCalls?: number;
  maxQueuedWriteBytes?: number;
  protocolLimits?: Partial<ArgusProtocolLimits>;
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
  private server: net.Server | null = null;

  constructor(options: ArgusServerOptions = {}) {
    this.options = options;
    this.limiter = new ConcurrencyLimiter({
      maxConcurrent: options.maxConcurrentCalls,
      maxQueued: options.maxQueuedCalls
    });
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

  async listen(port = 0, host = "127.0.0.1"): Promise<number> {
    if (this.server) {
      throw new ArgusError({
        code: "ARGUS_SERVER_ALREADY_LISTENING",
        message: "Argus server is already listening"
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
    });

    socket.on("data", (chunk: Buffer) => {
      try {
        const frames = decoder.push(chunk);
        for (const frame of frames) {
          assertFrameAllowedFromPeer("server", frame);
          void this.handleFrame(socket, writer, calls, frame).catch(() => socket.destroy());
        }
      } catch (error) {
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
      await writer.write(encodeFrame(createFrame({
        type: ArgusMessageType.PONG,
        messageId: frame.messageId,
        method: "",
        payload: null
      }), this.options.protocolLimits));
      return;
    }

    if (frame.type === ArgusMessageType.CANCEL) {
      calls.get(frame.messageId)?.abort(new ArgusError({
        code: "ARGUS_CALL_CANCELLED",
        message: "Argus call cancelled by peer",
        status: ArgusStatus.CANCELLED
      }));
      return;
    }

    if (calls.has(frame.messageId)) {
      await this.writeError(writer, frame.messageId, frame.method, new ArgusError({
        code: "ARGUS_DUPLICATE_MESSAGE_ID",
        message: "A call with this message id is already active",
        status: ArgusStatus.INVALID_ARGUMENT
      }));
      return;
    }

    const controller = new AbortController();
    calls.set(frame.messageId, controller);

    try {
      await this.limiter.run(async () => {
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
            this.registry.execute(frame.method, request.payload, context),
            controller.signal
          );
          await writer.write(encodeFrame(createFrame({
            type: ArgusMessageType.RESPONSE,
            messageId: frame.messageId,
            method: frame.method,
            payload: serializePayload(result)
          }), this.options.protocolLimits));
        } finally {
          if (deadlineTimer) clearTimeout(deadlineTimer);
        }
      });
    } catch (error) {
      const argusError = ArgusError.fromUnknown(error, "ARGUS_HANDLER_ERROR");
      await this.writeError(writer, frame.messageId, frame.method, argusError);
    } finally {
      if (calls.get(frame.messageId) === controller) calls.delete(frame.messageId);
    }
  }

  private async writeError(
    writer: SocketWriter,
    messageId: number,
    method: string,
    error: ArgusError
  ): Promise<void> {
    await writer.write(encodeFrame(createFrame({
      type: ArgusMessageType.ERROR,
      messageId,
      method,
      payload: error.toJSON()
    }), this.options.protocolLimits));
  }
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
