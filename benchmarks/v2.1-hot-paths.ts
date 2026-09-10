import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  ArgusFrameStreamDecoder,
  ArgusMessageType,
  ChunkQueue,
  ConcurrencyLimiter,
  MessageIdAllocator,
  createFrame,
  encodeFrame
} from "../src";

interface Sample {
  name: string;
  depth: number;
  durationMs: number;
  operations: number;
  operationsPerSecond: number;
}

const SMOKE = process.env.ARGUS_V21_BENCH_SCALE === "smoke";
const DEPTHS = SMOKE ? [100, 1000] : [1000, 10_000];
const ID_ITERATIONS = SMOKE ? 1000 : 20_000;
const PROTOCOL_ITERATIONS = SMOKE ? 1000 : 25_000;

function measure(name: string, depth: number, operations: number, task: () => void): Sample {
  const startedAt = performance.now();
  task();
  const durationMs = performance.now() - startedAt;
  return {
    name,
    depth,
    durationMs,
    operations,
    operationsPerSecond: durationMs === 0 ? 0 : operations / (durationMs / 1000)
  };
}

function benchmarkMessageIds(depth: number): Sample[] {
  const pending = new Map<number, true>();
  for (let id = 1; id <= depth; id += 1) pending.set(id, true);

  const current = new MessageIdAllocator();
  current.setNextForTesting(Math.min(depth + 1, 0xffffffff));
  const currentSample = measure("message-id/live-map", depth, ID_ITERATIONS, () => {
    for (let index = 0; index < ID_ITERATIONS; index += 1) current.allocate(pending);
  });

  const legacy = new MessageIdAllocator();
  legacy.setNextForTesting(Math.min(depth + 1, 0xffffffff));
  const legacySample = measure("message-id/legacy-set-snapshot", depth, ID_ITERATIONS, () => {
    for (let index = 0; index < ID_ITERATIONS; index += 1) {
      legacy.allocate(new Set(pending.keys()));
    }
  });

  return [currentSample, legacySample];
}

function benchmarkChunkQueue(depth: number): Sample[] {
  const current = measure("chunk-queue/head-cursor", depth, depth, () => {
    const queue = new ChunkQueue();
    for (let index = 0; index < depth; index += 1) queue.append(Buffer.from([index % 251]));
    for (let index = 0; index < depth; index += 1) queue.read(1);
  });

  const legacy = measure("chunk-queue/legacy-shift", depth, depth, () => {
    const chunks = Array.from({ length: depth }, (_, index) => Buffer.from([index % 251]));
    for (let index = 0; index < depth; index += 1) chunks.shift();
  });

  return [current, legacy];
}

async function benchmarkLimiter(depth: number): Promise<Sample> {
  const limiter = new ConcurrencyLimiter({ maxConcurrent: 1, maxQueued: depth });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = limiter.run(async () => gate);
  const queued = Array.from({ length: depth }, (_, index) => limiter.run(async () => index));
  const startedAt = performance.now();
  release();
  await first;
  await Promise.all(queued);
  const durationMs = performance.now() - startedAt;
  return {
    name: "concurrency-limiter/head-cursor",
    depth,
    durationMs,
    operations: depth,
    operationsPerSecond: durationMs === 0 ? 0 : depth / (durationMs / 1000)
  };
}

function benchmarkProtocol(): Sample {
  const encoded = encodeFrame(createFrame({
    type: ArgusMessageType.REQUEST,
    messageId: 42,
    method: "bench.echo",
    payload: { ok: true, value: 42 }
  }));
  const decoder = new ArgusFrameStreamDecoder();

  return measure("protocol/encode-stream-decode", encoded.length, PROTOCOL_ITERATIONS, () => {
    for (let index = 0; index < PROTOCOL_ITERATIONS; index += 1) {
      const frame = encodeFrame(createFrame({
        type: ArgusMessageType.REQUEST,
        messageId: (index % 0xfffffffe) + 1,
        method: "bench.echo",
        payload: { ok: true, value: 42 }
      }));
      const decoded = decoder.push(frame);
      if (decoded.length !== 1) throw new Error("ARGUS_V21_BENCH_DECODE_INVARIANT");
    }
  });
}

async function main(): Promise<void> {
  const samples: Sample[] = [];
  for (const depth of DEPTHS) {
    samples.push(...benchmarkMessageIds(depth));
    samples.push(...benchmarkChunkQueue(depth));
    samples.push(await benchmarkLimiter(depth));
  }
  samples.push(benchmarkProtocol());

  const result = {
    schemaVersion: 1,
    commit: process.env.GITHUB_SHA ?? process.env.ARGUS_BENCH_COMMIT ?? "unknown",
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model ?? "unknown",
      logicalCpus: os.cpus().length
    },
    config: {
      scale: SMOKE ? "smoke" : "full",
      depths: DEPTHS,
      idIterations: ID_ITERATIONS,
      protocolIterations: PROTOCOL_ITERATIONS
    },
    samples
  };

  console.log("Argus v2.1 hot-path benchmark");
  for (const sample of samples) {
    console.log(
      `${sample.name.padEnd(38)} depth=${String(sample.depth).padStart(6)} ` +
      `${sample.durationMs.toFixed(3)}ms ${sample.operationsPerSecond.toFixed(0)} ops/s`
    );
  }
  console.log(`RESULT_JSON=${JSON.stringify(result)}`);
  console.log("Timing is diagnostic only; CI gates correctness/structure, not wall-clock thresholds.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
