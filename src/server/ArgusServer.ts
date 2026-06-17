import net from "node:net";
import { MethodRegistry, type ArgusMethodHandler } from "./method-registry";
import {
  ArgusMessageType,
  createFrame,
  decodeFrames,
  encodeFrame
} from "../protocol";
import { parsePayload, serializePayload } from "../protocol/json";

export class ArgusServer {
  private readonly registry = new MethodRegistry();
  private readonly sockets = new Set<net.Socket>();
  private server: net.Server | null = null;

  method(name: string, handler: ArgusMethodHandler): this {
    this.registry.register(name, handler);
    return this;
  }

  methods(): string[] {
    return this.registry.list();
  }

  async listen(port = 0, host = "127.0.0.1"): Promise<number> {
    if (this.server) {
      throw new Error("ARGUS_SERVER_ALREADY_LISTENING");
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
      throw new Error("ARGUS_INVALID_SERVER_ADDRESS");
    }

    return address.port;
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }

    this.sockets.clear();

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
    this.sockets.add(socket);

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
        const response = createFrame({
          type: ArgusMessageType.ERROR,
          messageId: 0,
          method: "",
          payload: {
            code: "ARGUS_INVALID_FRAME",
            message: error instanceof Error ? error.message : "Invalid frame"
          }
        });

        socket.write(encodeFrame(response));
      }
    });

    socket.on("close", () => {
      this.sockets.delete(socket);
    });

    socket.on("error", () => {
      this.sockets.delete(socket);
      socket.destroy();
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
      const response = createFrame({
        type: ArgusMessageType.ERROR,
        messageId: frame.messageId,
        method: frame.method,
        payload: {
          code: error instanceof Error ? error.message : "ARGUS_HANDLER_ERROR",
          message: error instanceof Error ? error.message : "Handler failed"
        }
      });

      socket.write(encodeFrame(response));
    }
  }
}
