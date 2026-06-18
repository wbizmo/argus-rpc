import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
});
