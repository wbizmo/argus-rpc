import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  ArgusClient,
  ArgusFrameStreamDecoder,
  ArgusMessageType,
  createFrame,
  encodeFrame
} from "../../src";

describe("Argus client response type validation", () => {
  let client: ArgusClient | null = null;
  let peer: net.Server | null = null;

  afterEach(async () => {
    await client?.close();
    if (peer?.listening) {
      await new Promise<void>((resolve) => peer!.close(() => resolve()));
    }
    client = null;
    peer = null;
  });

  it("rejects a PONG carrying the message id of a normal RPC call", async () => {
    const port = await startPeer(ArgusMessageType.PONG);
    client = new ArgusClient({ port, timeoutMs: 1000 });

    await expect(client.call("user.get", { id: 1 })).rejects.toMatchObject({
      code: "ARGUS_UNEXPECTED_RESPONSE_TYPE"
    });
  });

  it("rejects a RESPONSE carrying the message id of a ping", async () => {
    const port = await startPeer(ArgusMessageType.RESPONSE);
    client = new ArgusClient({ port, timeoutMs: 1000 });

    await expect(client.ping()).rejects.toMatchObject({
      code: "ARGUS_UNEXPECTED_RESPONSE_TYPE"
    });
  });

  async function startPeer(responseType: ArgusMessageType): Promise<number> {
    peer = net.createServer((socket) => {
      const decoder = new ArgusFrameStreamDecoder();
      socket.on("data", (chunk: Buffer) => {
        for (const frame of decoder.push(chunk)) {
          socket.write(encodeFrame(createFrame({
            type: responseType,
            messageId: frame.messageId,
            method: frame.method,
            payload: responseType === ArgusMessageType.RESPONSE ? { ok: true } : null
          })));
        }
      });
    });

    await new Promise<void>((resolve) => peer!.listen(0, "127.0.0.1", resolve));
    const address = peer.address();
    if (!address || typeof address === "string") throw new Error("TEST_INVALID_PEER_ADDRESS");
    return address.port;
  }
});
