import { ArgusError } from "../errors";

export interface ConcurrencyLimiterOptions {
  maxConcurrent?: number;
  maxQueued?: number;
}

interface WaitingTask<T = unknown> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export class ConcurrencyLimiter {
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;
  private readonly queue: WaitingTask[] = [];
  private activeCount = 0;

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
    return this.queue.length;
  }

  run<T>(task: () => Promise<T> | T): Promise<T> {
    const wrapped = async (): Promise<T> => task();

    if (this.activeCount < this.maxConcurrent) {
      return this.execute(wrapped);
    }

    if (this.queue.length >= this.maxQueued) {
      return Promise.reject(new ArgusError({
        code: "ARGUS_SERVER_OVERLOADED",
        message: "Argus server concurrency queue is full",
        details: {
          active: this.activeCount,
          queued: this.queue.length,
          maxConcurrent: this.maxConcurrent,
          maxQueued: this.maxQueued
        }
      }));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task: wrapped,
        resolve: resolve as (value: unknown) => void,
        reject
      });
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
      const next = this.queue.shift();
      if (!next) return;

      void this.execute(next.task).then(next.resolve, next.reject);
    }
  }
}
