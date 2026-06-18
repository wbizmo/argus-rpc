import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusServer } from "../../src";

describe("Argus retry integration", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
    await client?.close();
    await server?.close();

    client = null;
    server = null;
  });

  it("retries failed calls and eventually succeeds", async () => {
    server = new ArgusServer();

    let attempts = 0;

    server.method("unstable.method", async () => {
      attempts += 1;

      if (attempts < 3) {
        throw new Error("ARGUS_TEMPORARY_FAILURE");
      }

      return {
        ok: true,
        attempts
      };
    });

    const port = await server.listen();

    client = new ArgusClient({
      port,
      retry: {
        retries: 3,
        baseDelayMs: 1,
        maxDelayMs: 2
      }
    });

    await expect(client.call("unstable.method", {})).resolves.toEqual({
      ok: true,
      attempts: 3
    });

    expect(attempts).toBe(3);
  });

  it("stops retrying after retry exhaustion", async () => {
    server = new ArgusServer();

    let attempts = 0;

    server.method("always.fails", async () => {
      attempts += 1;
      throw new Error("ARGUS_ALWAYS_FAILS");
    });

    const port = await server.listen();

    client = new ArgusClient({
      port,
      retry: {
        retries: 2,
        baseDelayMs: 1,
        maxDelayMs: 2
      }
    });

    await expect(client.call("always.fails", {})).rejects.toThrow("ARGUS_ALWAYS_FAILS");

    expect(attempts).toBe(3);
  });
});
