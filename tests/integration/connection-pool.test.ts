import { afterEach, describe, expect, it } from "vitest";
import { ArgusConnectionPool, ArgusServer } from "../../src";

describe("Argus connection pool integration", () => {
  let server: ArgusServer | null = null;
  let pool: ArgusConnectionPool | null = null;

  afterEach(async () => {
    await pool?.close();
    await server?.close();

    pool = null;
    server = null;
  });

  it("creates and reuses pooled TCP connections", async () => {
    server = new ArgusServer();

    server.method("identity.echo", async (payload) => {
      return payload;
    });

    const port = await server.listen();

    pool = new ArgusConnectionPool({
      port,
      size: 2
    });

    await expect(pool.call("identity.echo", { value: 1 })).resolves.toEqual({
      value: 1
    });

    await expect(pool.call("identity.echo", { value: 2 })).resolves.toEqual({
      value: 2
    });

    expect(pool.stats().created).toBe(1);
    expect(pool.stats().available).toBe(1);
  });

  it("supports heartbeat through pooled connections", async () => {
    server = new ArgusServer();
    const port = await server.listen();

    pool = new ArgusConnectionPool({
      port,
      size: 2
    });

    await expect(pool.ping()).resolves.toBe(true);
    expect(pool.stats().created).toBe(1);
  });

  it("supports several sequential pooled calls", async () => {
    server = new ArgusServer();

    server.method("math.increment", async (payload) => {
      const input = payload as { value: number };

      return {
        value: input.value + 1
      };
    });

    const port = await server.listen();

    pool = new ArgusConnectionPool({
      port,
      size: 2
    });

    for (let value = 0; value < 5; value += 1) {
      await expect(pool.call("math.increment", { value })).resolves.toEqual({
        value: value + 1
      });
    }

    expect(pool.stats().created).toBe(1);
  });

  it("drops timed-out capacity waiters without leaving stale queue entries", async () => {
    server = new ArgusServer();
    server.method("work.delay", async (payload) => {
      const { delayMs } = payload as { delayMs: number };
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { ok: true };
    });
    const port = await server.listen();

    pool = new ArgusConnectionPool({
      port,
      size: 1,
      maxConcurrentPerConnection: 1,
      acquireTimeoutMs: 25,
      circuitBreaker: false
    });

    const first = pool.call("work.delay", { delayMs: 100 });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const waiting = Array.from({ length: 100 }, () =>
      pool!.call("work.delay", { delayMs: 0 }).then(
        () => "completed",
        (error: unknown) => (error as { code?: string }).code
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(pool.stats().waiters).toBeGreaterThan(0);

    const outcomes = await Promise.all(waiting);
    expect(outcomes.every((code) => code === "ARGUS_POOL_ACQUIRE_TIMEOUT")).toBe(true);
    expect(pool.stats().waiters).toBe(0);

    await first;
    await expect(pool.call("work.delay", { delayMs: 0 })).resolves.toEqual({ ok: true });
  });
});
