import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusError, ArgusServer } from "../../src";

describe("Argus heartbeat integration", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
    await client?.close();
    await server?.close();

    client = null;
    server = null;
  });

  it("responds to ping with pong", async () => {
    server = new ArgusServer();
    const port = await server.listen();

    client = new ArgusClient({ port });

    await expect(client.ping()).resolves.toBe(true);
  });

  it("supports heartbeat after a normal RPC call", async () => {
    server = new ArgusServer();

    server.method("system.status", async () => {
      return {
        ok: true
      };
    });

    const port = await server.listen();
    client = new ArgusClient({ port });

    await expect(client.call("system.status")).resolves.toEqual({
      ok: true
    });

    await expect(client.ping()).resolves.toBe(true);
  });

  it("throws ArgusError when ping cannot connect", async () => {
    client = new ArgusClient({
      port: 65530,
      timeoutMs: 20
    });

    await expect(client.ping()).rejects.toBeInstanceOf(Error);
  });
});
