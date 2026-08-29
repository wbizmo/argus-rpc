import { describe, expect, it } from "vitest";
import { ConcurrencyLimiter } from "../../src";

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe("ConcurrencyLimiter", () => {
  it("starts queued work in FIFO order", async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrent: 1, maxQueued: 3 });
    const started: number[] = [];

    const run = (id: number) => limiter.run(async () => {
      started.push(id);
      await delay(5);
      return id;
    });

    const result = await Promise.all([run(1), run(2), run(3)]);
    expect(result).toEqual([1, 2, 3]);
    expect(started).toEqual([1, 2, 3]);
  });

  it("rejects excess work instead of growing an unbounded queue", async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrent: 1, maxQueued: 1 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = limiter.run(async () => gate);
    const second = limiter.run(async () => true);
    await expect(limiter.run(async () => true)).rejects.toMatchObject({
      code: "ARGUS_SERVER_OVERLOADED"
    });

    release();
    await first;
    await second;
  });
});
