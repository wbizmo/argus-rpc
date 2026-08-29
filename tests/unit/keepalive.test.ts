import { describe, expect, it } from "vitest";
import { KeepaliveMonitor } from "../../src";

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe("KeepaliveMonitor", () => {
  it("records round-trip health for successful pings", async () => {
    const monitor = new KeepaliveMonitor(async () => true, { intervalMs: 5 });
    monitor.start();
    await delay(20);
    monitor.stop();

    const stats = monitor.stats();
    expect(stats.running).toBe(false);
    expect(stats.missed).toBe(0);
    expect(stats.lastSuccessAt).toBeTypeOf("number");
    expect(stats.lastRttMs).toBeTypeOf("number");
  });

  it("marks repeated ping failures unhealthy", async () => {
    let unhealthyMisses = 0;
    const monitor = new KeepaliveMonitor(async () => {
      throw new Error("down");
    }, {
      intervalMs: 5,
      maxMissed: 2,
      onUnhealthy: (missed) => {
        unhealthyMisses = missed;
      }
    });

    monitor.start();
    await delay(25);
    monitor.stop();

    expect(unhealthyMisses).toBeGreaterThanOrEqual(2);
    expect(monitor.stats().missed).toBeGreaterThanOrEqual(2);
  });
});
