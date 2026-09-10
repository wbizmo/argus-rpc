# Argus RPC Benchmarks

Argus ships reproducible local benchmark harnesses for transport comparison and for the v2.1 hot-path engineering work. They are diagnostic tools, not universal performance claims.

## End-to-end Argus vs HTTP/JSON

Run:

```bash
npm run bench
```

Configuration is environment-driven:

```bash
ARGUS_BENCH_REQUESTS=10000 \
ARGUS_BENCH_CONCURRENCY=128 \
ARGUS_BENCH_WARMUP=500 \
ARGUS_BENCH_JSON=1 \
npm run bench
```

| Variable | Default | Meaning |
| --- | ---: | --- |
| `ARGUS_BENCH_REQUESTS` | `1000` | measured requests per transport |
| `ARGUS_BENCH_CONCURRENCY` | `50` | concurrent workers / maximum HTTP sockets |
| `ARGUS_BENCH_WARMUP` | `min(100, requests)` | unmeasured warmup requests |
| `ARGUS_BENCH_JSON` | unset | emit a machine-readable `RESULT_JSON=` record when set to `1` |

Invalid or non-positive numeric values fall back to the defaults.

Each transport reports total/completed/failed requests, error rate, duration, average latency, p50/p90/p95/p99/max latency and requests per second. The runner also records Node version, operating system, architecture, CPU model and logical CPU count.

The Argus side uses one persistent multiplexed `ArgusClient` connection. The HTTP baseline uses Node's built-in HTTP implementation with keep-alive and a maximum socket count equal to benchmark concurrency. This is a real local-path comparison, but it does not isolate every protocol/runtime variable.

## v2.1 hot-path benchmark

Run the engineering benchmark with:

```bash
npm run bench:v2.1
```

It exercises the areas changed during the v2.1 efficiency pass:

- message-ID allocation against the live pending `Map`;
- a same-process legacy reference that rebuilds `new Set(pending.keys())` per allocation;
- `ChunkQueue` consumption using the v2.1 head cursor;
- a same-process legacy reference that removes array index zero with `shift()`;
- deep `ConcurrencyLimiter` queue drain;
- protocol encode + streaming decode throughput.

The benchmark always emits a `RESULT_JSON=` record containing the commit (when `GITHUB_SHA` or `ARGUS_BENCH_COMMIT` is available), Node/runtime details, CPU information, benchmark configuration and every sample. The legacy reference measurements are deliberately small reproductions of the removed algorithms, not old binaries or claims about an historical release.

For a shorter CI-sized run:

```bash
ARGUS_V21_BENCH_SCALE=smoke npm run bench:v2.1
```

The Node 22 CI job executes this smoke run after typecheck, tests, build and package verification. Its output therefore provides a release-candidate record tied to an exact Git commit.

### Why CI does not gate wall-clock performance

Shared GitHub runners are noisy. Argus does **not** fail CI because one timing sample is slower than a hard millisecond threshold. Instead, `tests/benchmark/complexity-regression.test.ts` enforces the structural properties responsible for the v2.1 complexity fixes, including:

- no per-request pending-ID `Set` snapshot;
- no `Array.shift()` in the identified FIFO hot paths;
- no per-frame message-type enum enumeration;
- no per-error status enum enumeration;
- no sorted method list merely to count methods;
- no removal of unrelated socket `drain` listeners.

Behavioral stress tests separately exercise deep queues, fragmented reads, contention, cancellation and backpressure. This makes the CI gate deterministic while keeping benchmark timings available for analysis.

## Publishing results

Do not paste a single throughput number into the README and present it as a property of the protocol. For a publishable benchmark record, include at least:

1. Argus commit SHA and release version;
2. Node version;
3. OS and architecture;
4. CPU model and logical CPU count;
5. request count, concurrency and warmup size;
6. all relevant latency/throughput/error measurements;
7. whether the machine was otherwise idle;
8. multiple runs, with the median run preferred over the best run.

For deeper work, sweep several dimensions rather than tuning one favorite scenario:

- concurrency: `1`, `8`, `32`, `128`, `512`;
- request count: `10k`, `100k`, and larger only when the host is stable;
- payload sizes: empty, `64 B`, `1 KiB`, `16 KiB`, `1 MiB`;
- one multiplexed connection versus a configured connection pool;
- supported Node versions;
- fragmented frame sizes and write-queue depths for transport work.

Store raw machine-readable output with the benchmark date and commit SHA if results are going to be referenced from documentation.

## Interpreting results

A lower local latency or higher local request rate can explain a transport behavior; it does not prove that Argus should replace HTTP, gRPC, or another production RPC stack. Network topology, TLS, payload shape, server work, backpressure, retries, deadlines, observability and failure behavior can dominate real systems.

Argus treats benchmarking as part of protocol engineering: reproducible setup, explicit assumptions, tail latency, failures and environment metadata matter more than a vanity multiplier.
