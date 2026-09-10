import { ArgusError } from "../errors";

export interface ConcurrencyLimiterOptions {
  maxConcurrent?: number;
  maxQueued?: number;
}

interface WaitingTask<T = unknown> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  state: "queued" | "started" | "cancelled";
}

export class ConcurrencyLimiter {
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;
  private queue: WaitingTask[] = [];
  private queueHead = 0;
  private activeCount = 0;
  private queuedCount = 0;

  constructor(options: ConcurrencyLimiterOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 128;
    this.maxQueued = options.maxQueued ?? 1024;

    if (!Number.isInteger(this.maxConcurrent) || this.maxConcurrent < 1) {
      throw new Error("ARGUS_INVALID_CONCURRENCY_LIMIT");
    }
    if (!Number.isInteger(this.maxQueued) || this.maxQueued < 0) {
      throw new Error("ARGUS_INVALID_QUEUE_LIMIT");
    }
  }

  get active(): number {
    return this.activeCount;
  }

  get queued(): number {
    return this.queuedCount;
  }

  run<T>(task: () => Promise<T> | T, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));

    const wrapped = async (): Promise<T> => task();

    if (this.activeCount < this.maxConcurrent) {
      return this.execute(wrapped);
    }

    if (this.queuedCount >= this.maxQueued) {
      return Promise.reject(new ArgusError({
        code: "ARGUS_SERVER_OVERLOADED",
        message: "Argus server concurrency queue is full",
        details: {
          active: this.activeCount,
          queued: this.queuedCount,
          maxConcurrent: this.maxConcurrent,
          maxQueued: this.maxQueued
        }
      }));
    }

    return new Promise<T>((resolve, reject) => {
      const waiting: WaitingTask = {
        task: wrapped,
        resolve: resolve as (value: unknown) => void,
        reject,
        signal,
        state: "queued"
      };

      if (signal) {
        waiting.onAbort = () => {
          if (waiting.state !== "queued") return;
          waiting.state = "cancelled";
          this.queuedCount -= 1;
          signal.removeEventListener("abort", waiting.onAbort!);
          reject(abortReason(signal));
          this.compactQueue();
        };
        signal.addEventListener("abort", waiting.onAbort, { once: true });
      }

      this.queue.push(waiting);
      this.queuedCount += 1;
    });
  }

  private async execute<T>(task: () => Promise<T>): Promise<T> {
    this.activeCount += 1;
    try {
      return await task();
    } finally {
      this.activeCount -= 1;
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    while (this.activeCount < this.maxConcurrent) {
      const next = this.dequeue();
      if (!next) return;

      next.state = "started";
      this.queuedCount -= 1;
      if (next.signal && next.onAbort) {
        next.signal.removeEventListener("abort", next.onAbort);
      }

      void this.execute(next.task).then(next.resolve, next.reject);
    }
  }

  private dequeue(): WaitingTask | undefined {
    while (this.queueHead < this.queue.length) {
      const next = this.queue[this.queueHead++];
      if (next?.state === "queued") {
        this.compactQueue();
        return next;
      }
    }

    this.compactQueue();
    return undefined;
  }

  private compactQueue(): void {
    if (this.queueHead === this.queue.length) {
      this.queue.length = 0;
      this.queueHead = 0;
      return;
    }

    if (this.queueHead >= 1024 && this.queueHead * 2 >= this.queue.length) {
      this.queue = this.queue.slice(this.queueHead);
      this.queueHead = 0;
    }
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new ArgusError({
      code: "ARGUS_CALL_CANCELLED",
      message: "Argus queued call was cancelled"
    });
}
