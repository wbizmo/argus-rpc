import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  ArgusMessageType,
  ArgusServer,
  createFrame,
  decodeFrame,
  encodeFrame
} from "../../src";

function connectRawSocket(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port
    });

    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

describe("invalid payload behavior", () => {
  let server: ArgusServer | null = null;
  const sockets: net.Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets) {
      socket.destroy();
    }

    sockets.length = 0;

    await server?.close();
    server = null;
  });

  it("returns an error frame for malformed JSON payloads", async () => {
    server = new ArgusServer();

    server.method("json.only", async (payload) => {
      return payload;
    });

    const port = await server.listen();
    const socket = await connectRawSocket(port);
    sockets.push(socket);

    const frame = encodeFrame(
      createFrame({
        type: ArgusMessageType.REQUEST,
        messageId: 77,
        method: "json.only",
        payload: Buffer.from("{bad-json", "utf8")
      })
    );

    const response = await new Promise<Buffer>((resolve) => {
      socket.once("data", (chunk: Buffer) => resolve(Buffer.from(chunk)));
      socket.write(frame);
    });

    const decoded = decodeFrame(response);

    expect(decoded.frame?.type).toBe(ArgusMessageType.ERROR);
    expect(decoded.frame?.messageId).toBe(77);
  });
});
