import { describe, expect, it } from "vitest";
import { calculateBackoffDelay, withRetry } from "../../src";

describe("retry utilities", () => {
  it("calculates exponential backoff delays", () => {
    expect(calculateBackoffDelay(1, 100, 1000)).toBe(100);
    expect(calculateBackoffDelay(2, 100, 1000)).toBe(200);
    expect(calculateBackoffDelay(3, 100, 1000)).toBe(400);
  });

  it("caps exponential backoff at max delay", () => {
    expect(calculateBackoffDelay(10, 100, 500)).toBe(500);
  });

  it("returns successful operation result without retrying", async () => {
    let attempts = 0;

    const result = await withRetry(async () => {
      attempts += 1;
      return "ok";
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(1);
  });

  it("retries failed operations", async () => {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error("temporary failure");
        }

        return "ok";
      },
      {
        retries: 3,
        baseDelayMs: 1,
        maxDelayMs: 2
      }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("stops after retry limit", async () => {
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("still failing");
        },
        {
          retries: 2,
          baseDelayMs: 1,
          maxDelayMs: 2
        }
      )
    ).rejects.toThrow("still failing");

    expect(attempts).toBe(3);
  });

  it("respects shouldRetry predicate", async () => {
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("do not retry");
        },
        {
          retries: 3,
          baseDelayMs: 1,
          maxDelayMs: 2,
          shouldRetry: () => false
        }
      )
    ).rejects.toThrow("do not retry");

    expect(attempts).toBe(1);
  });
});
