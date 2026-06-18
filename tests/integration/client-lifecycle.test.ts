import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusError, ArgusServer } from "../../src";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("Argus client lifecycle", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
    await client?.close();
    await server?.close();

    client = null;
    server = null;
  });

  it("connects lazily when call is made", async () => {
    server = new ArgusServer();

    server.method("system.ok", async () => {
      return { ok: true };
    });

    const port = await server.listen();
    client = new ArgusClient({ port });

    await expect(client.call("system.ok")).resolves.toEqual({ ok: true });
  });

  it("allows connect to be called more than once", async () => {
    server = new ArgusServer();
    const port = await server.listen();

    client = new ArgusClient({ port });

    await client.connect();
    await client.connect();

    expect(server.stats().connections).toBe(1);
  });

  it("rejects pending requests when client closes", async () => {
    server = new ArgusServer();

    server.method("slow.close", async () => {
      await sleep(100);
      return { ok: true };
    });

    const port = await server.listen();
    client = new ArgusClient({ port, timeoutMs: 500 });

    await client.connect();

    const pendingExpectation = expect(client.call("slow.close")).rejects.toBeInstanceOf(ArgusError);

    await sleep(10);
    await client.close();

    await pendingExpectation;
  });

  it("fails when connecting to unavailable server", async () => {
    client = new ArgusClient({
      port: 65529,
      timeoutMs: 20
    });

    await expect(client.connect()).rejects.toBeInstanceOf(Error);
  });
});
