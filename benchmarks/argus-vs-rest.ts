import http from "node:http";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { ArgusClient, ArgusServer } from "../src";

interface BenchmarkResult {
  name: string;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  errorRate: number;
  totalDurationMs: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  requestsPerSecond: number;
}

interface BenchmarkSample {
  ok: boolean;
  latencyMs: number;
}

const TOTAL_REQUESTS = positiveInteger(process.env.ARGUS_BENCH_REQUESTS, 1000);
const CONCURRENCY = positiveInteger(process.env.ARGUS_BENCH_CONCURRENCY, 50);
const WARMUP_REQUESTS = positiveInteger(
  process.env.ARGUS_BENCH_WARMUP,
  Math.min(100, TOTAL_REQUESTS)
);

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function summarizeBenchmark(
  name: string,
  samples: BenchmarkSample[],
  totalDurationMs: number
): BenchmarkResult {
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
    errorRate: samples.length === 0 ? 0 : failedRequests / samples.length,
    totalDurationMs,
    averageLatencyMs: completedRequests === 0 ? 0 : totalLatency / completedRequests,
    p50LatencyMs: percentile(latencies, 50),
    p90LatencyMs: percentile(latencies, 90),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    maxLatencyMs: latencies.length === 0 ? 0 : Math.max(...latencies),
    requestsPerSecond: totalDurationMs === 0 ? 0 : (completedRequests / totalDurationMs) * 1000
  };
}

async function runConcurrent(
  total: number,
  concurrency: number,
  task: () => Promise<void>
): Promise<BenchmarkSample[]> {
  const samples: BenchmarkSample[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    while (next < total) {
      next += 1;
      const startedAt = performance.now();
      try {
        await task();
        samples.push({ ok: true, latencyMs: performance.now() - startedAt });
      } catch {
        samples.push({ ok: false, latencyMs: performance.now() - startedAt });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker())
  );
  return samples;
}

async function warmup(task: () => Promise<void>): Promise<void> {
  await runConcurrent(WARMUP_REQUESTS, Math.min(CONCURRENCY, WARMUP_REQUESTS), task);
}

async function benchmarkArgus(): Promise<BenchmarkResult> {
  const server = new ArgusServer();
  server.method("bench.echo", async (payload) => payload);

  const port = await server.listen();
  const client = new ArgusClient({ port, timeoutMs: 5000 });
  const task = async (): Promise<void> => {
    await client.call("bench.echo", { ok: true, value: 42 });
  };

  try {
    await warmup(task);
    const startedAt = performance.now();
    const samples = await runConcurrent(TOTAL_REQUESTS, CONCURRENCY, task);
    return summarizeBenchmark("Argus TCP binary RPC", samples, performance.now() - startedAt);
  } finally {
    await client.close();
    await server.close();
  }
}

function startHttpJsonServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/rpc/bench.echo") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": body.length
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
            server.close((error) => error ? closeReject(error) : closeResolve());
          });
        }
      });
    });
  });
}

function postJson(port: number, agent: http.Agent): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const body = JSON.stringify({ ok: true, value: 42 });
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/rpc/bench.echo",
      method: "POST",
      agent,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body)
      }
    }, (response) => {
      response.resume();
      response.on("end", () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP_${response.statusCode}`));
        }
      });
    });
    request.once("error", reject);
    request.end(body);
  });
}

async function benchmarkHttpJson(): Promise<BenchmarkResult> {
  const server = await startHttpJsonServer();
  const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });
  const task = () => postJson(server.port, agent);

  try {
    await warmup(task);
    const startedAt = performance.now();
    const samples = await runConcurrent(TOTAL_REQUESTS, CONCURRENCY, task);
    return summarizeBenchmark("Node HTTP JSON", samples, performance.now() - startedAt);
  } finally {
    agent.destroy();
    await server.close();
  }
}

function printResult(result: BenchmarkResult): void {
  console.log(`\n${result.name}`);
  console.log("-".repeat(result.name.length));
  console.log(`Total requests:      ${result.totalRequests}`);
  console.log(`Completed requests:  ${result.completedRequests}`);
  console.log(`Failed requests:     ${result.failedRequests}`);
  console.log(`Error rate:          ${(result.errorRate * 100).toFixed(2)}%`);
  console.log(`Total duration:      ${result.totalDurationMs.toFixed(2)}ms`);
  console.log(`Average latency:     ${result.averageLatencyMs.toFixed(3)}ms`);
  console.log(`P50 latency:         ${result.p50LatencyMs.toFixed(3)}ms`);
  console.log(`P90 latency:         ${result.p90LatencyMs.toFixed(3)}ms`);
  console.log(`P95 latency:         ${result.p95LatencyMs.toFixed(3)}ms`);
  console.log(`P99 latency:         ${result.p99LatencyMs.toFixed(3)}ms`);
  console.log(`Max latency:         ${result.maxLatencyMs.toFixed(3)}ms`);
  console.log(`Requests/second:     ${result.requestsPerSecond.toFixed(2)}`);
}

async function main(): Promise<void> {
  const cpu = os.cpus()[0]?.model ?? "unknown";
  console.log("Argus Benchmark Suite");
  console.log("=====================");
  console.log(`Runtime: ${process.version} | ${process.platform}/${process.arch}`);
  console.log(`CPU: ${cpu}`);
  console.log(`Logical CPUs: ${os.cpus().length}`);
  console.log(`Requests: ${TOTAL_REQUESTS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Warmup requests: ${WARMUP_REQUESTS}`);

  const argus = await benchmarkArgus();
  const httpJson = await benchmarkHttpJson();

  printResult(argus);
  printResult(httpJson);

  if (process.env.ARGUS_BENCH_JSON === "1") {
    console.log(`\nRESULT_JSON=${JSON.stringify({
      schemaVersion: 1,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu,
        logicalCpus: os.cpus().length
      },
      config: {
        totalRequests: TOTAL_REQUESTS,
        concurrency: CONCURRENCY,
        warmupRequests: WARMUP_REQUESTS
      },
      results: [argus, httpJson]
    })}`);
  }

  console.log("\nBenchmarks are environment-specific; publish results only with machine and commit metadata.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
