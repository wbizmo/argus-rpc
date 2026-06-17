import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusError, ArgusServer } from "../../src";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("Argus failure modes", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
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
});
