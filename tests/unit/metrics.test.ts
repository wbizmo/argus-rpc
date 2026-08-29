import { describe, expect, it } from "vitest";
import { ArgusMetrics } from "../../src";

describe("ArgusMetrics", () => {
  it("tracks counters and gauges without retaining event samples", () => {
    const metrics = new ArgusMetrics();
    metrics.increment("rpc.calls.started");
    metrics.increment("rpc.calls.started", 2);
    metrics.gauge("connections.active", 4);

    expect(metrics.snapshot()).toMatchObject({
      counters: { "rpc.calls.started": 3 },
      gauges: { "connections.active": 4 }
    });
  });

  it("records bounded cumulative latency histograms", () => {
    const metrics = new ArgusMetrics();
    metrics.observe("rpc.server.duration_ms", 2);
    metrics.observe("rpc.server.duration_ms", 20);
    metrics.observe("rpc.server.duration_ms", 200);

    const histogram = metrics.snapshot().histograms["rpc.server.duration_ms"];
    expect(histogram).toMatchObject({
      count: 3,
      sum: 222,
      min: 2,
      max: 200
    });
    expect(histogram?.buckets.le_5).toBe(1);
    expect(histogram?.buckets.le_25).toBe(2);
    expect(histogram?.buckets.le_250).toBe(3);
  });

  it("can reset all accumulated state", () => {
    const metrics = new ArgusMetrics();
    metrics.increment("calls");
    metrics.gauge("active", 1);
    metrics.observe("latency", 10);
    metrics.reset();

    expect(metrics.snapshot()).toEqual({
      counters: {},
      gauges: {},
      histograms: {}
    });
  });
});
