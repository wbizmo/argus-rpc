# Argus RPC Benchmarks

Argus ships a reproducible local benchmark harness for comparing the Argus TCP request/response path with a Node HTTP/JSON baseline. It is a diagnostic tool, not a universal performance claim.

## Run

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

## Reported measurements

Each transport reports:

- total, completed and failed requests;
- error rate;
- total measured duration;
- average latency;
- p50, p90, p95 and p99 latency;
- maximum observed latency;
- requests per second.

The runner also records the Node version, operating system, architecture, CPU model and logical CPU count. These environment fields are mandatory context for any published result.

## Comparison shape

### Argus

The benchmark uses one persistent `ArgusClient` connection and multiplexes concurrent RPCs across it. The server echoes a small JSON-compatible payload through the normal Argus request envelope and response path.

### HTTP baseline

The baseline uses Node's built-in HTTP implementation with a keep-alive agent and a maximum socket count equal to benchmark concurrency. Requests are POSTed to a local JSON echo endpoint. Keep-alive is intentional so the comparison does not artificially penalize HTTP with a new TCP connection for every request.

The benchmark therefore compares two real local request paths, but it still does **not** isolate every variable. Argus framing, request envelopes, HTTP parsing, header processing, scheduling and implementation details differ.

## Publishing results

Do not paste a single throughput number into the README and present it as a property of the protocol. For a publishable benchmark record, include at least:

1. Argus commit SHA and release version;
2. Node version;
3. OS and architecture;
4. CPU model and logical CPU count;
5. request count, concurrency and warmup size;
6. all latency percentiles, throughput and error rate;
7. whether the machine was otherwise idle;
8. multiple runs, with the median run preferred over the best run.

For deeper work, sweep several dimensions rather than tuning one favorite scenario:

- concurrency: `1`, `8`, `32`, `128`, `512`;
- request count: `10k`, `100k`, and larger only when the host is stable;
- payload sizes: empty, `64 B`, `1 KiB`, `16 KiB`, `1 MiB`;
- one multiplexed connection versus a configured connection pool;
- supported Node versions.

Store raw machine-readable output with the benchmark date and commit SHA if results are going to be referenced from documentation.

## Interpreting results

A lower local latency or higher local request rate can explain a transport behavior; it does not prove that Argus should replace HTTP, gRPC, or another production RPC stack. Network topology, TLS, payload shape, server work, backpressure, retries, deadlines, observability and failure behavior can dominate real systems.

Argus treats benchmarking as part of protocol engineering: reproducible setup, explicit assumptions, tail latency, failures and environment metadata matter more than a vanity multiplier.
