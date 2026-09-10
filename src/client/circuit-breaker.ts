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
  private generation = 0;

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
    if (!Number.isInteger(this.halfOpenMaxCalls) || this.halfOpenMaxCalls < 1) {
      throw new Error("ARGUS_INVALID_CIRCUIT_HALF_OPEN_LIMIT");
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

    const startedState = this.currentState;
    const startedGeneration = this.generation;
    if (startedState === CircuitState.HALF_OPEN) this.halfOpenActive += 1;

    try {
      const result = await operation();
      this.onSuccess(startedState, startedGeneration);
      return result;
    } catch (error) {
      this.onFailure(error, startedState, startedGeneration);
      throw error;
    } finally {
      if (
        startedState === CircuitState.HALF_OPEN &&
        this.currentState === CircuitState.HALF_OPEN &&
        this.generation === startedGeneration
      ) {
        this.halfOpenActive = Math.max(0, this.halfOpenActive - 1);
      }
    }
  }

  reset(): void {
    this.generation += 1;
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

  private onSuccess(startedState: CircuitState, startedGeneration: number): void {
    if (startedGeneration !== this.generation) return;

    if (startedState === CircuitState.CLOSED) {
      if (this.currentState !== CircuitState.CLOSED) return;
      this.failures = 0;
      return;
    }

    if (
      startedState === CircuitState.HALF_OPEN &&
      this.currentState === CircuitState.HALF_OPEN &&
      this.halfOpenActive === 1
    ) {
      this.generation += 1;
      this.currentState = CircuitState.CLOSED;
      this.failures = 0;
      this.openedAt = 0;
      this.halfOpenActive = 0;
    }
  }

  private onFailure(
    error: unknown,
    startedState: CircuitState,
    startedGeneration: number
  ): void {
    if (!this.shouldCountFailure(error) || startedGeneration !== this.generation) return;

    if (startedState === CircuitState.HALF_OPEN) {
      if (this.currentState === CircuitState.HALF_OPEN) this.openCircuit();
      return;
    }

    if (startedState !== CircuitState.CLOSED || this.currentState !== CircuitState.CLOSED) return;

    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openCircuit();
  }

  private openCircuit(): void {
    this.generation += 1;
    this.currentState = CircuitState.OPEN;
    this.openedAt = Date.now();
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
