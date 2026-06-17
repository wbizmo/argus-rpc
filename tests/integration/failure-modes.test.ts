import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  ARGUS_VERSION,
  ArgusClient,
  ArgusError,
  ArgusMessageType,
  ArgusServer,
  createFrame,
  decodeFrame,
  encodeFrame
} from "../../src";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

describe("Argus failure modes", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;
  const rawSockets: net.Socket[] = [];

  afterEach(async () => {
    for (const socket of rawSockets) {
      socket.destroy();
    }

    rawSockets.length = 0;

    await client?.close();
    await server?.close();

    client = null;
    server = null;
  });

  it("throws ArgusError for unknown methods", async () => {
    server = new ArgusServer();
    const port = await server.listen();

    client = new ArgusClient({ port });

    try {
      await client.call("missing.method", {});
      throw new Error("expected call to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ArgusError);
      expect((error as ArgusError).code).toBe("ARGUS_METHOD_NOT_FOUND");
    }
  });

  it("times out slow requests", async () => {
    server = new ArgusServer();

    server.method("slow.method", async () => {
      await sleep(100);
      return { ok: true };
    });

    const port = await server.listen();
    client = new ArgusClient({ port, timeoutMs: 20 });

    try {
      await client.call("slow.method", {});
      throw new Error("expected call to timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(ArgusError);
      expect((error as ArgusError).code).toBe("ARGUS_REQUEST_TIMEOUT");
    }
  });

  it("tracks active server connections", async () => {
    server = new ArgusServer();
    const port = await server.listen();

    client = new ArgusClient({ port });
    await client.connect();

    expect(server.stats().connections).toBe(1);
  });

  it("removes closed connections from server stats", async () => {
    server = new ArgusServer();
    const port = await server.listen();

    client = new ArgusClient({ port });
    await client.connect();

    expect(server.stats().connections).toBe(1);

    await client.close();
    await sleep(10);

    expect(server.stats().connections).toBe(0);
  });

  it("returns an invalid frame error for corrupted magic bytes", async () => {
    server = new ArgusServer();
    const port = await server.listen();

    const socket = await connectRawSocket(port);
    rawSockets.push(socket);

    const frame = encodeFrame(
      createFrame({
        type: ArgusMessageType.REQUEST,
        messageId: 99,
        method: "system.ping",
        payload: {}
      })
    );

    frame.write("ZZ", 0, 2, "ascii");

    const response = await new Promise<Buffer>((resolve) => {
      socket.once("data", (chunk: Buffer) => resolve(Buffer.from(chunk)));
      socket.write(frame);
    });

    const decoded = decodeFrame(response);

    expect(decoded.frame?.type).toBe(ArgusMessageType.ERROR);
    expect(decoded.frame?.messageId).toBe(0);
    expect(decoded.frame?.payload.toString("utf8")).toContain("ARGUS_INVALID_MAGIC");
  });

  it("returns an invalid frame error for unsupported protocol versions", async () => {
    server = new ArgusServer();
    const port = await server.listen();

    const socket = await connectRawSocket(port);
    rawSockets.push(socket);

    const frame = encodeFrame(
      createFrame({
        type: ArgusMessageType.REQUEST,
        messageId: 100,
        method: "system.ping",
        payload: {}
      })
    );

    frame.writeUInt8(ARGUS_VERSION + 1, 2);

    const response = await new Promise<Buffer>((resolve) => {
      socket.once("data", (chunk: Buffer) => resolve(Buffer.from(chunk)));
      socket.write(frame);
    });

    const decoded = decodeFrame(response);

    expect(decoded.frame?.type).toBe(ArgusMessageType.ERROR);
    expect(decoded.frame?.messageId).toBe(0);
    expect(decoded.frame?.payload.toString("utf8")).toContain("ARGUS_UNSUPPORTED_VERSION");
  });
});
