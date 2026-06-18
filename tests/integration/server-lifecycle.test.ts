import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusError, ArgusServer } from "../../src";

describe("Argus server lifecycle", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
    await client?.close();
    await server?.close();

    client = null;
    server = null;
  });

  it("rejects listen when server is already listening", async () => {
    server = new ArgusServer();

    await server.listen();

    await expect(server.listen()).rejects.toBeInstanceOf(ArgusError);
  });

  it("allows close to be called before listen", async () => {
    server = new ArgusServer();

    await expect(server.close()).resolves.toBeUndefined();
  });

  it("destroys active client connections when server closes", async () => {
    server = new ArgusServer();

    server.method("system.ok", async () => {
      return { ok: true };
    });

    const port = await server.listen();

    client = new ArgusClient({ port });
    await client.connect();

    expect(server.stats().connections).toBe(1);

    await server.close();

    expect(server.stats().connections).toBe(0);
  });

  it("reports method and connection stats", async () => {
    server = new ArgusServer();

    server.method("a", async () => null);
    server.method("b", async () => null);

    expect(server.stats().methods).toBe(2);
    expect(server.stats().connections).toBe(0);
  });
});
