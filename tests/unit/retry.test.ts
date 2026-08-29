import { describe, expect, it } from "vitest";
import {
  ArgusError,
  ArgusStatus,
  applyBackoffJitter,
  calculateBackoffDelay,
  withRetry
} from "../../src";

describe("retry utilities", () => {
  it("calculates capped exponential backoff delays", () => {
    expect(calculateBackoffDelay(1, 100, 1000)).toBe(100);
    expect(calculateBackoffDelay(2, 100, 1000)).toBe(200);
    expect(calculateBackoffDelay(3, 100, 1000)).toBe(400);
    expect(calculateBackoffDelay(10, 100, 500)).toBe(500);
  });

  it("applies deterministic bounded jitter", () => {
    expect(applyBackoffJitter(100, 0.2, () => 0)).toBe(80);
    expect(applyBackoffJitter(100, 0.2, () => 0.5)).toBe(100);
    expect(applyBackoffJitter(100, 0.2, () => 1)).toBe(120);
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

  it("retries explicitly retryable Argus failures", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new ArgusError({
          code: "ARGUS_TEMPORARY_FAILURE",
          message: "temporary failure",
          status: ArgusStatus.UNAVAILABLE
        });
      }
      return "ok";
    }, {
      retries: 3,
      baseDelayMs: 1,
      maxDelayMs: 2,
      jitterRatio: 0
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry arbitrary application errors by default", async () => {
    let attempts = 0;
    await expect(withRetry(async () => {
      attempts += 1;
      throw new Error("business rule failed");
    }, { retries: 3 })).rejects.toThrow("business rule failed");
    expect(attempts).toBe(1);
  });

  it("still supports an explicit retry predicate", async () => {
    let attempts = 0;
    await expect(withRetry(async () => {
      attempts += 1;
      throw new Error("explicit policy");
    }, {
      retries: 2,
      baseDelayMs: 1,
      maxDelayMs: 2,
      jitterRatio: 0,
      shouldRetry: () => true
    })).rejects.toThrow("explicit policy");
    expect(attempts).toBe(3);
  });
});
