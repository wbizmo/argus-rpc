import { ArgusError } from "../errors";
import { ArgusStatus } from "../rpc";

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN"
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxCalls?: number;
  shouldCountFailure?: (error: unknown) => boolean;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxCalls: number;
  private readonly shouldCountFailure: (error: unknown) => boolean;
  private currentState = CircuitState.CLOSED;
  private failures = 0;
  private openedAt = 0;
  private halfOpenActive = 0;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 10_000;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls ?? 1;
    this.shouldCountFailure = options.shouldCountFailure ?? ((error) =>
      error instanceof ArgusError && error.retryable
    );

    if (!Number.isInteger(this.failureThreshold) || this.failureThreshold < 1) {
      throw new Error("ARGUS_INVALID_CIRCUIT_FAILURE_THRESHOLD");
    }
    if (!Number.isInteger(this.resetTimeoutMs) || this.resetTimeoutMs < 1) {
      throw new Error("ARGUS_INVALID_CIRCUIT_RESET_TIMEOUT");
    }
  }

  get state(): CircuitState {
    this.refreshState();
    return this.currentState;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.refreshState();

    if (this.currentState === CircuitState.OPEN) {
      throw this.openError();
    }
    if (
      this.currentState === CircuitState.HALF_OPEN &&
      this.halfOpenActive >= this.halfOpenMaxCalls
    ) {
      throw this.openError();
    }

    if (this.currentState === CircuitState.HALF_OPEN) this.halfOpenActive += 1;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    } finally {
      if (this.halfOpenActive > 0) this.halfOpenActive -= 1;
    }
  }

  reset(): void {
    this.currentState = CircuitState.CLOSED;
    this.failures = 0;
    this.openedAt = 0;
    this.halfOpenActive = 0;
  }

  stats(): { state: CircuitState; failures: number; openedAt?: number } {
    return {
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt || undefined
    };
  }

  private refreshState(): void {
    if (
      this.currentState === CircuitState.OPEN &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.currentState = CircuitState.HALF_OPEN;
      this.halfOpenActive = 0;
    }
  }

  private onSuccess(): void {
    this.currentState = CircuitState.CLOSED;
    this.failures = 0;
    this.openedAt = 0;
  }

  private onFailure(error: unknown): void {
    if (!this.shouldCountFailure(error)) return;

    this.failures += 1;
    if (
      this.currentState === CircuitState.HALF_OPEN ||
      this.failures >= this.failureThreshold
    ) {
      this.currentState = CircuitState.OPEN;
      this.openedAt = Date.now();
    }
  }

  private openError(): ArgusError {
    return new ArgusError({
      code: "ARGUS_CIRCUIT_OPEN",
      message: "Argus circuit breaker is open",
      status: ArgusStatus.UNAVAILABLE,
      retryable: true
    });
  }
}
