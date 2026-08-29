export interface KeepaliveOptions {
  intervalMs?: number;
  maxMissed?: number;
  onUnhealthy?: (missed: number) => void;
}

export interface KeepaliveStats {
  running: boolean;
  missed: number;
  lastRttMs?: number;
  lastSuccessAt?: number;
}

export class KeepaliveMonitor {
  private readonly intervalMs: number;
  private readonly maxMissed: number;
  private readonly onUnhealthy?: (missed: number) => void;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private missed = 0;
  private lastRttMs?: number;
  private lastSuccessAt?: number;

  constructor(
    private readonly ping: () => Promise<boolean>,
    options: KeepaliveOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.maxMissed = options.maxMissed ?? 2;
    this.onUnhealthy = options.onUnhealthy;

    if (!Number.isInteger(this.intervalMs) || this.intervalMs < 1) {
      throw new Error("ARGUS_INVALID_KEEPALIVE_INTERVAL");
    }
    if (!Number.isInteger(this.maxMissed) || this.maxMissed < 1) {
      throw new Error("ARGUS_INVALID_KEEPALIVE_MISSES");
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  stats(): KeepaliveStats {
    return {
      running: this.timer !== null,
      missed: this.missed,
      lastRttMs: this.lastRttMs,
      lastSuccessAt: this.lastSuccessAt
    };
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    const startedAt = Date.now();

    try {
      if (!(await this.ping())) throw new Error("ARGUS_KEEPALIVE_FALSE");
      this.missed = 0;
      this.lastRttMs = Date.now() - startedAt;
      this.lastSuccessAt = Date.now();
    } catch {
      this.missed += 1;
      if (this.missed >= this.maxMissed) this.onUnhealthy?.(this.missed);
    } finally {
      this.inFlight = false;
    }
  }
}
