import { afterEach, describe, expect, it, vi } from "vitest";
import { ArgusError, ArgusStatus, CircuitBreaker, CircuitState } from "../../src";

const unavailable = () => new ArgusError({
  code: "ARGUS_UNAVAILABLE",
  message: "unavailable",
  status: ArgusStatus.UNAVAILABLE
});

afterEach(() => {
  vi.useRealTimers();
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

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid half-open probe limits: %s",
    (halfOpenMaxCalls) => {
      expect(() => new CircuitBreaker({ halfOpenMaxCalls })).toThrow(
        "ARGUS_INVALID_CIRCUIT_HALF_OPEN_LIMIT"
      );
    }
  );

  it("does not let a stale half-open success close a circuit reopened by a peer probe", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10,
      halfOpenMaxCalls: 2
    });

    await expect(breaker.execute(async () => { throw unavailable(); })).rejects.toBeInstanceOf(ArgusError);
    expect(breaker.state).toBe(CircuitState.OPEN);

    vi.setSystemTime(1_011);
    expect(breaker.state).toBe(CircuitState.HALF_OPEN);

    let rejectFirst!: (error: Error) => void;
    let resolveSecond!: (value: string) => void;
    const first = breaker.execute(() => new Promise<string>((_resolve, reject) => {
      rejectFirst = reject;
    }));
    const second = breaker.execute(() => new Promise<string>((resolve) => {
      resolveSecond = resolve;
    }));

    rejectFirst(unavailable());
    await expect(first).rejects.toBeInstanceOf(ArgusError);
    expect(breaker.state).toBe(CircuitState.OPEN);

    resolveSecond("ok");
    await expect(second).resolves.toBe("ok");
    expect(breaker.state).toBe(CircuitState.OPEN);
  });
});
