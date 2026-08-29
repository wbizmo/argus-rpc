import { afterEach, describe, expect, it } from "vitest";
import {
  ArgusConnectionPool,
  ArgusError,
  ArgusServer,
  ArgusStatus
} from "../../src";

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe("multiplexed connection pooling", () => {
  let server: ArgusServer | null = null;
  let pool: ArgusConnectionPool | null = null;

  afterEach(async () => {
    await pool?.close();
    await server?.close();
    pool = null;
    server = null;
  });

  it("runs concurrent calls over one pooled TCP channel", async () => {
    server = new ArgusServer({ maxConcurrentCalls: 32 });
    server.method("work", async (payload) => {
      await delay(10);
      return payload;
    });

    const port = await server.listen();
    pool = new ArgusConnectionPool({
      port,
      size: 1,
      maxConcurrentPerConnection: 32,
      circuitBreaker: false
    });

    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, value) => pool!.call("work", { value }))
    );

    expect(responses).toHaveLength(12);
    expect(pool.stats().created).toBe(1);
    expect(server.stats().connections).toBe(1);
  });

  it("does not retire a healthy channel for application-level failures", async () => {
    server = new ArgusServer();
    server.method("sometimes", async (payload) => {
      const input = payload as { fail: boolean };
      if (input.fail) {
        throw new ArgusError({
          code: "ARGUS_EXPECTED_FAILURE",
          message: "expected",
          status: ArgusStatus.FAILED_PRECONDITION
        });
      }
      return { ok: true };
    });

    const port = await server.listen();
    pool = new ArgusConnectionPool({ port, size: 1, circuitBreaker: false });

    await expect(pool.call("sometimes", { fail: true })).rejects.toMatchObject({
      status: ArgusStatus.FAILED_PRECONDITION
    });
    await expect(pool.call("sometimes", { fail: false })).resolves.toEqual({ ok: true });
    expect(pool.stats().created).toBe(1);
  });
});
