import net from "node:net";
import { ConnectionManager } from "../connection";
import { ArgusError } from "../errors";
import { MethodRegistry, type ArgusMethodHandler } from "./method-registry";
import {
  ArgusMessageType,
  createFrame,
  decodeFrames,
  encodeFrame
} from "../protocol";
import { parsePayload, serializePayload } from "../protocol/json";

export interface ArgusServerStats {
  connections: number;
  methods: number;
}

export class ArgusServer {
  private readonly registry = new MethodRegistry();
  private readonly connections = new ConnectionManager();
  private server: net.Server | null = null;

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
      methods: this.registry.list().length
    };
  }

  async listen(port = 0, host = "127.0.0.1"): Promise<number> {
    if (this.server) {
      throw new ArgusError({
        code: "ARGUS_SERVER_ALREADY_LISTENING",
        message: "Argus server is already listening"
      });
    }

    this.server = net.createServer((socket) => {
      this.handleSocket(socket);
    });

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

    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private handleSocket(socket: net.Socket): void {
    this.connections.add(socket);

    let pendingBuffer = Buffer.alloc(0);

    socket.on("data", async (chunk: Buffer) => {
      const incoming = Buffer.from(chunk);
      pendingBuffer = Buffer.concat([pendingBuffer, incoming]);

      try {
        const result = decodeFrames(pendingBuffer);
        pendingBuffer = Buffer.from(result.remaining);

        for (const frame of result.frames) {
          await this.handleFrame(socket, frame);
        }
      } catch (error) {
        const argusError = ArgusError.fromUnknown(error, "ARGUS_INVALID_FRAME");

        const response = createFrame({
          type: ArgusMessageType.ERROR,
          messageId: 0,
          method: "",
          payload: argusError.toJSON()
        });

        socket.write(encodeFrame(response));
      }
    });
  }

  private async handleFrame(
    socket: net.Socket,
    frame: {
      type: ArgusMessageType;
      messageId: number;
      method: string;
      payload: Buffer;
    }
  ): Promise<void> {
    if (frame.type === ArgusMessageType.PING) {
      const response = createFrame({
        type: ArgusMessageType.PONG,
        messageId: frame.messageId,
        method: "",
        payload: null
      });

      socket.write(encodeFrame(response));
      return;
    }

    if (frame.type !== ArgusMessageType.REQUEST) {
      return;
    }

    try {
      const requestPayload = parsePayload(frame.payload);
      const result = await this.registry.execute(frame.method, requestPayload);

      const response = createFrame({
        type: ArgusMessageType.RESPONSE,
        messageId: frame.messageId,
        method: frame.method,
        payload: serializePayload(result)
      });

      socket.write(encodeFrame(response));
    } catch (error) {
      const argusError = ArgusError.fromUnknown(error, "ARGUS_HANDLER_ERROR");

      const response = createFrame({
        type: ArgusMessageType.ERROR,
        messageId: frame.messageId,
        method: frame.method,
        payload: argusError.toJSON()
      });

      socket.write(encodeFrame(response));
    }
  }
}
