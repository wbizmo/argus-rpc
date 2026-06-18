import { describe, expect, it } from "vitest";
import { ArgusConnectionPool } from "../../src";

describe("ArgusConnectionPool", () => {
  it("rejects invalid pool sizes", () => {
    expect(
      () =>
        new ArgusConnectionPool({
          port: 7000,
          size: 0
        })
    ).toThrow("ARGUS_INVALID_POOL_SIZE");
  });

  it("starts with empty stats", () => {
    const pool = new ArgusConnectionPool({
      port: 7000,
      size: 2
    });

    expect(pool.stats()).toEqual({
      size: 2,
      created: 0,
      available: 0,
      inUse: 0,
      unhealthy: 0
    });
  });
});
