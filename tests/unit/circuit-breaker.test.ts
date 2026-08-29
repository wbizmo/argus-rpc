import { describe, expect, it } from "vitest";
import { ArgusError, ArgusStatus, CircuitBreaker, CircuitState } from "../../src";

const unavailable = () => new ArgusError({
  code: "ARGUS_UNAVAILABLE",
  message: "unavailable",
  status: ArgusStatus.UNAVAILABLE
});

describe("CircuitBreaker", () => {
  it("opens after the configured transient failure threshold", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });

    await expect(breaker.execute(async () => { throw unavailable(); })).rejects.toBeInstanceOf(ArgusError);
    await expect(breaker.execute(async () => { throw unavailable(); })).rejects.toBeInstanceOf(ArgusError);
    expect(breaker.state).toBe(CircuitState.OPEN);

    await expect(breaker.execute(async () => true)).rejects.toMatchObject({
      code: "ARGUS_CIRCUIT_OPEN"
    });
  });

  it("does not count non-retryable application failures", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    await expect(breaker.execute(async () => {
      throw new ArgusError({
        code: "ARGUS_BAD_INPUT",
        message: "bad input",
        status: ArgusStatus.INVALID_ARGUMENT
      });
    })).rejects.toBeInstanceOf(ArgusError);

    expect(breaker.state).toBe(CircuitState.CLOSED);
  });
});
