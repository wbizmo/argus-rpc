export interface ArgusHistogramSnapshot {
  count: number;
  sum: number;
  min?: number;
  max?: number;
  buckets: Record<string, number>;
}

interface MutableHistogram {
  count: number;
  sum: number;
  min?: number;
  max?: number;
  buckets: number[];
}

const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000];

export class ArgusMetrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, MutableHistogram>();

  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  observe(name: string, value: number): void {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = {
        count: 0,
        sum: 0,
        buckets: DEFAULT_BUCKETS.map(() => 0)
      };
      this.histograms.set(name, histogram);
    }

    histogram.count += 1;
    histogram.sum += value;
    histogram.min = histogram.min === undefined ? value : Math.min(histogram.min, value);
    histogram.max = histogram.max === undefined ? value : Math.max(histogram.max, value);
    DEFAULT_BUCKETS.forEach((boundary, index) => {
      if (value <= boundary) histogram!.buckets[index] = (histogram!.buckets[index] ?? 0) + 1;
    });
  }

  snapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, ArgusHistogramSnapshot>;
  } {
    const histograms: Record<string, ArgusHistogramSnapshot> = {};
    for (const [name, histogram] of this.histograms) {
      const buckets: Record<string, number> = {};
      DEFAULT_BUCKETS.forEach((boundary, index) => {
        buckets[`le_${boundary}`] = histogram.buckets[index] ?? 0;
      });
      histograms[name] = {
        count: histogram.count,
        sum: histogram.sum,
        min: histogram.min,
        max: histogram.max,
        buckets
      };
    }

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
