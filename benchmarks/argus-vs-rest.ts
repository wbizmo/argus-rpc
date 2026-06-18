import http from "node:http";
import { performance } from "node:perf_hooks";
import { ArgusClient, ArgusServer } from "../src";

interface BenchmarkResult {
  name: string;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  totalDurationMs: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  requestsPerSecond: number;
}

interface BenchmarkSample {
  ok: boolean;
  latencyMs: number;
}

const TOTAL_REQUESTS = Number(process.env.ARGUS_BENCH_REQUESTS ?? 1000);
const CONCURRENCY = Number(process.env.ARGUS_BENCH_CONCURRENCY ?? 50);

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;

  return sorted[Math.max(0, index)] ?? 0;
}

function summarizeBenchmark(name: string, samples: BenchmarkSample[], totalDurationMs: number): BenchmarkResult {
  const successful = samples.filter((sample) => sample.ok);
  const latencies = successful.map((sample) => sample.latencyMs);
  const completedRequests = successful.length;
  const failedRequests = samples.length - completedRequests;
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);

  return {
    name,
    totalRequests: samples.length,
    completedRequests,
    failedRequests,
    totalDurationMs,
    averageLatencyMs: completedRequests === 0 ? 0 : totalLatency / completedRequests,
    p95LatencyMs: percentile(latencies, 95),
    requestsPerSecond: totalDurationMs === 0 ? 0 : (completedRequests / totalDurationMs) * 1000
  };
}

async function runConcurrent(total: number, concurrency: number, task: () => Promise<void>): Promise<BenchmarkSample[]> {
  const samples: BenchmarkSample[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    while (next < total) {
      next += 1;

      const startedAt = performance.now();

      try {
        await task();

        samples.push({
          ok: true,
          latencyMs: performance.now() - startedAt
        });
      } catch {
        samples.push({
          ok: false,
          latencyMs: performance.now() - startedAt
        });
      }
    }
  }

  await Promise.all(
    Array.from({
      length: concurrency
    }).map(() => worker())
  );

  return samples;
}

async function benchmarkArgus(): Promise<BenchmarkResult> {
  const server = new ArgusServer();

  server.method("bench.echo", async (payload) => {
    return payload;
  });

  const port = await server.listen();
  const client = new ArgusClient({
    port,
    timeoutMs: 5000
  });

  const startedAt = performance.now();

  try {
    const samples = await runConcurrent(TOTAL_REQUESTS, CONCURRENCY, async () => {
      await client.call("bench.echo", {
        ok: true,
        value: 42
      });
    });

    return summarizeBenchmark("Argus TCP binary RPC", samples, performance.now() - startedAt);
  } finally {
    await client.close();
    await server.close();
  }
}

function startHttpJsonServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const server = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/rpc/bench.echo") {
      response.writeHead(404, {
        "content-type": "application/json"
      });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });

    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");

      response.writeHead(200, {
        "content-type": "application/json"
      });

      response.end(body);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("INVALID_HTTP_SERVER_ADDRESS"));
        return;
      }

      resolve({
        port: address.port,
        close: async () => {
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          });
        }
      });
    });
  });
}

async function postJson(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const body = JSON.stringify({
      ok: true,
      value: 42
    });

    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/rpc/bench.echo",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        }
      },
      (response) => {
        response.resume();

        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
            return;
          }

          reject(new Error(`HTTP_${response.statusCode}`));
        });
      }
    );

    request.once("error", reject);
    request.end(body);
  });
}

async function benchmarkHttpJson(): Promise<BenchmarkResult> {
  const server = await startHttpJsonServer();
  const startedAt = performance.now();

  try {
    const samples = await runConcurrent(TOTAL_REQUESTS, CONCURRENCY, async () => {
      await postJson(server.port);
    });

    return summarizeBenchmark("Node HTTP JSON", samples, performance.now() - startedAt);
  } finally {
    await server.close();
  }
}

function printResult(result: BenchmarkResult): void {
  console.log(`\n${result.name}`);
  console.log("-".repeat(result.name.length));
  console.log(`Total requests:      ${result.totalRequests}`);
  console.log(`Completed requests:  ${result.completedRequests}`);
  console.log(`Failed requests:     ${result.failedRequests}`);
  console.log(`Total duration:      ${result.totalDurationMs.toFixed(2)}ms`);
  console.log(`Average latency:     ${result.averageLatencyMs.toFixed(3)}ms`);
  console.log(`P95 latency:         ${result.p95LatencyMs.toFixed(3)}ms`);
  console.log(`Requests/second:     ${result.requestsPerSecond.toFixed(2)}`);
}

async function main(): Promise<void> {
  console.log("Argus Benchmark Suite");
  console.log("=====================");
  console.log(`Requests: ${TOTAL_REQUESTS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);

  const argus = await benchmarkArgus();
  const httpJson = await benchmarkHttpJson();

  printResult(argus);
  printResult(httpJson);

  console.log("\nNote:");
  console.log("Benchmarks vary by machine, runtime, CPU load, and environment.");
  console.log("This script is intended for local comparison and infrastructure research.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
