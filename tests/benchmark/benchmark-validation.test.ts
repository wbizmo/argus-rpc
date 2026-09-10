import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("benchmark runner", () => {
  it("executes the Argus versus HTTP benchmark script", async () => {
    const result = await execFileAsync(
      "npx",
      ["tsx", "benchmarks/argus-vs-rest.ts"],
      {
        env: {
          ...process.env,
          ARGUS_BENCH_REQUESTS: "20",
          ARGUS_BENCH_CONCURRENCY: "5"
        },
        timeout: 15000
      }
    );

    expect(result.stdout).toContain("Argus Benchmark Suite");
    expect(result.stdout).toContain("Argus TCP binary RPC");
    expect(result.stdout).toContain("Node HTTP JSON");
    expect(result.stdout).toContain("Requests/second");
  }, 20000);

  it("emits machine-readable v2.1 hot-path benchmark results", async () => {
    const result = await execFileAsync(
      "npx",
      ["tsx", "benchmarks/v2.1-hot-paths.ts"],
      {
        env: {
          ...process.env,
          ARGUS_V21_BENCH_SCALE: "smoke",
          ARGUS_BENCH_COMMIT: "test-sha"
        },
        timeout: 15000
      }
    );

    const record = result.stdout
      .split("\n")
      .find((line) => line.startsWith("RESULT_JSON="));

    expect(record).toBeDefined();
    const parsed = JSON.parse(record!.slice("RESULT_JSON=".length)) as {
      schemaVersion: number;
      commit: string;
      config: { scale: string };
      samples: Array<{ name: string }>;
    };

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.commit).toBe("test-sha");
    expect(parsed.config.scale).toBe("smoke");
    expect(parsed.samples.map((sample) => sample.name)).toContain("message-id/live-map");
    expect(parsed.samples.map((sample) => sample.name)).toContain("message-id/legacy-set-snapshot");
    expect(parsed.samples.map((sample) => sample.name)).toContain("chunk-queue/head-cursor");
    expect(parsed.samples.map((sample) => sample.name)).toContain("chunk-queue/legacy-shift");
  }, 20000);
});
