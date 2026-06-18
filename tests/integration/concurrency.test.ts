import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusConnectionPool, ArgusServer } from "../../src";

describe("Argus concurrency behavior", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;
  let pool: ArgusConnectionPool | null = null;

  afterEach(async () => {
    await pool?.close();
    await client?.close();
    await server?.close();

    pool = null;
    client = null;
    server = null;
  });

  it("handles many concurrent calls on one client", async () => {
    server = new ArgusServer();

    server.method("math.add", async (payload) => {
      const input = payload as { a: number; b: number };

      return {
        value: input.a + input.b
      };
    });

    const port = await server.listen();
    client = new ArgusClient({ port });

    const calls = Array.from({ length: 25 }).map((_, index) => {
      return client?.call("math.add", {
        a: index,
        b: index
      });
    });

    const results = await Promise.all(calls);

    expect(results).toHaveLength(25);
    expect(results[0]).toEqual({ value: 0 });
    expect(results[24]).toEqual({ value: 48 });
  });

  it("handles many sequential calls through the pool", async () => {
    server = new ArgusServer();

    server.method("counter.next", async (payload) => {
      const input = payload as { value: number };

      return {
        value: input.value + 1
      };
    });

    const port = await server.listen();

    pool = new ArgusConnectionPool({
      port,
      size: 3
    });

    const results = [];

    for (let index = 0; index < 20; index += 1) {
      results.push(await pool.call("counter.next", { value: index }));
    }

    expect(results).toHaveLength(20);
    expect(results[0]).toEqual({ value: 1 });
    expect(results[19]).toEqual({ value: 20 });
    expect(pool.stats().created).toBe(1);
  });
});
