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

  it("frees effective queue capacity immediately when queued work is cancelled", async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrent: 1, maxQueued: 1 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = limiter.run(async () => gate);
    const controller = new AbortController();
    const cancelled = limiter.run(async () => "never", controller.signal);

    expect(limiter.queued).toBe(1);
    controller.abort(new Error("cancelled"));
    await expect(cancelled).rejects.toThrow("cancelled");
    expect(limiter.queued).toBe(0);

    const replacement = limiter.run(async () => "replacement");
    expect(limiter.queued).toBe(1);

    release();
    await first;
    await expect(replacement).resolves.toBe("replacement");
    expect(limiter.queued).toBe(0);
    expect(limiter.active).toBe(0);
  });

  it("drains a deep queue in FIFO order without head shifting", async () => {
    const depth = 1500;
    const limiter = new ConcurrencyLimiter({ maxConcurrent: 1, maxQueued: depth });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = limiter.run(async () => gate);
    const queued = Array.from({ length: depth }, (_, index) =>
      limiter.run(async () => index)
    );

    expect(limiter.queued).toBe(depth);
    release();
    await first;

    const results = await Promise.all(queued);
    expect(results).toEqual(Array.from({ length: depth }, (_, index) => index));
    expect(limiter.queued).toBe(0);
    expect(limiter.active).toBe(0);
  });
});
