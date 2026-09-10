# Argus RPC

**TypeScript RPC over persistent TCP.**

Binary framing · multiplexed calls · distributed deadlines · cancellation · bounded backpressure · health-aware pooling · observable by design

[![CI](https://github.com/wbizmo/argus-rpc/actions/workflows/ci.yml/badge.svg)](https://github.com/wbizmo/argus-rpc/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/wbizmo/argus-rpc)](https://github.com/wbizmo/argus-rpc/releases)
![Node](https://img.shields.io/badge/node-20%20%7C%2022%20%7C%2024-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)

Argus RPC is a compact RPC runtime and wire protocol built from first principles in TypeScript. It uses persistent TCP connections, a small binary frame header and message IDs to multiplex independent calls without imposing HTTP semantics on the transport.

The current release is **v2.1.0**. It remains wire-compatible with Argus v2 while tightening state-machine correctness, cancellation behavior and the asymptotic cost of transport/scheduling hot paths.

Argus is an infrastructure engineering project, not a claim that every system should replace HTTP or gRPC.

## What's new in v2.1.0

v2.1 is an engineering-hardening release rather than a protocol rewrite.

- removed the per-request `Set` snapshot from message-ID allocation, eliminating O(n) temporary work for the common allocation path;
- replaced repeated front-of-array removals in transport/scheduling queues with head cursors and bounded compaction, avoiding accidental quadratic drain behavior;
- made queued server cancellation release queue capacity instead of leaving cancelled work resident until dispatch;
- made retry backoff abort-aware so cancellation does not wait for an unrelated sleep to finish;
- hardened client response correlation so a PONG cannot settle an RPC call and a normal response cannot silently settle a ping;
- fixed failed server-listen recovery so a bind failure does not leave the server permanently marked as listening;
- fixed circuit-breaker half-open configuration/race behavior;
- reduced repeated protocol normalization, enum enumeration and frame-size work in encode/decode paths;
- made server method-count statistics O(1) instead of sorting registered method names merely to count them;
- added structural complexity regression tests and a dedicated `bench:v2.1` hot-path benchmark with machine-readable output;
- remote plaintext binds remain refused by default unless the caller explicitly opts into an externally protected transport boundary.

## At a glance

| Capability | Argus RPC v2.1 |
| --- | --- |
| Transport | persistent TCP |
| Wire protocol | Argus v2 |
| Frame header | 14 bytes, big-endian integer fields |
| Multiplexing | yes, responses correlate by uint32 message ID |
| Request concurrency | bounded server execution + bounded queue |
| Deadlines | absolute deadline propagated to the server |
| Cancellation | `CANCEL` frame + handler `AbortSignal` + cancellation-aware queueing/retry backoff |
| Backpressure | serialized socket writer + bounded queued bytes + `drain` handling |
| Retries | opt-in, transient-aware, exponential backoff + jitter + elapsed-time budget |
| Connection pool | least-loaded multiplexed channels, bounded acquisition wait, dead-channel replacement |
| Circuit breaker | included in pooled calls, configurable/disableable |
| Heartbeat | `PING`/`PONG` primitives and RTT-aware keepalive controller |
| Metadata | normalized per-call string metadata |
| Middleware | composable server interceptors for auth, policy and tracing hooks |
| Errors | canonical RPC status taxonomy + structured details + retryability |
| Observability | bounded counters/histograms; no unbounded per-call sample retention |
| Codec extensibility | registry API with JSON and raw-buffer codec primitives |
| Runtime dependencies | **0** |
| CI runtimes | Node 20, 22 and 24 |
| Test suite | **156 tests across 39 files** at the v2.1 release checkpoint |

## Protocol limits

Argus validates declared lengths before waiting for frame bodies, so a peer cannot make the runtime retain an arbitrarily large partial frame simply by announcing a huge payload.

| Limit | v2 default | Wire maximum |
| --- | ---: | ---: |
| Method name | 1 KiB UTF-8 | 65,535 B |
| Payload | 8 MiB | 4,294,967,295 B |
| Frame | header + default method + default payload | constrained by wire fields |
| Message ID | uint32 | 4,294,967,295 |
| Socket writer queue | 4 MiB | configurable |

All practical limits are configurable independently from the wider representable wire range.

## Wire frame

```text
0               2 3 4       8       10              14
+---------------+-+-+-+-+----+--------+---------------+
| MAGIC "AR"    |V|TYPE | MESSAGE ID |METHOD| PAYLOAD |
+---------------+-+-+-+-+----+--------+---------------+
| method bytes ...              | payload bytes ...   |
+-----------------------------------------------------+
```

Exact fixed fields:

| Offset | Size | Field | Encoding |
| ---: | ---: | --- | --- |
| `0` | 2 B | magic | ASCII `AR` |
| `2` | 1 B | protocol version | unsigned |
| `3` | 1 B | message type | unsigned |
| `4` | 4 B | message ID | uint32 BE |
| `8` | 2 B | method length | uint16 BE |
| `10` | 4 B | payload length | uint32 BE |
| `14` | variable | method | UTF-8 |
| after method | variable | payload | bytes |

The fixed header is **14 bytes**.

### Message types

```text
1  REQUEST
2  RESPONSE
3  ERROR
4  PING
5  PONG
6  CANCEL
```

`REQUEST`, `PING` and `CANCEL` are client-to-server frames. `RESPONSE`, `ERROR` and `PONG` are server-to-client frames. Invalid direction is treated as a protocol violation rather than silently ignored.

## Request lifecycle

```text
caller
  │
  ├─ allocate collision-safe uint32 message id
  ├─ attach deadline + metadata
  ├─ encode v2 request envelope
  ▼
SocketWriter ── bounded write queue / drain ──► TCP
                                                   │
                                                   ▼
                                      incremental frame decoder
                                                   │
                                      protocol/resource validation
                                                   │
                                      bounded concurrency limiter
                                                   │
                                      interceptor chain
                                                   │
                                      method handler + AbortSignal
                                                   │
                                      RESPONSE / ERROR
                                                   │
  ◄──────────── message-id correlation ────────────┘
```

Calls can complete out of order. Correlation is by message ID, so one slow handler does not force unrelated calls received on the same connection to complete behind it.

## Server

```ts
import { ArgusServer } from "argus-rpc";

const server = new ArgusServer({
  maxConcurrentCalls: 256,
  maxQueuedCalls: 1024,
  maxQueuedWriteBytes: 4 * 1024 * 1024
});

server.method("user.get", async (payload, context) => {
  const { id } = payload as { id: number };

  if (context.signal.aborted) {
    throw context.signal.reason;
  }

  return {
    id,
    traceId: context.metadata["trace-id"] ?? null
  };
});

await server.listen(7000);
```

Handler context includes the message ID, method, peer address, start time, optional absolute deadline, normalized metadata and an `AbortSignal`.

Argus uses plaintext raw TCP. Non-loopback binds are refused by default; only opt into a remote bind when encryption/authentication is supplied by a trusted outer layer such as TLS termination, WireGuard or a service mesh.

## Client

```ts
import { ArgusClient } from "argus-rpc";

const client = new ArgusClient({
  host: "127.0.0.1",
  port: 7000,
  timeoutMs: 3000,
  retry: {
    retries: 2,
    baseDelayMs: 50,
    maxDelayMs: 500
  }
});

const controller = new AbortController();

const user = await client.callWithOptions("user.get", { id: 42 }, {
  timeoutMs: 1200,
  signal: controller.signal,
  metadata: {
    "trace-id": crypto.randomUUID()
  }
});
```

A local timeout is also a distributed deadline: the deadline is sent with the request and the client sends a best-effort `CANCEL` frame when the call times out or its signal aborts. Server handlers receive the cancellation through `context.signal`.

## Multiplexed connection pool

```ts
import { ArgusConnectionPool } from "argus-rpc";

const pool = new ArgusConnectionPool({
  port: 7000,
  size: 4,
  maxConcurrentPerConnection: 128,
  acquireTimeoutMs: 1000,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 5000
  }
});

const result = await pool.call("inventory.reserve", {
  sku: "ARG-001",
  quantity: 2
});
```

Pool slots are not one-request-at-a-time locks. Each healthy TCP channel can carry many in-flight calls, and the pool chooses the least-loaded healthy connection. Transport failures retire the channel so capacity can be recreated instead of leaving a dead entry permanently occupying a pool slot.

The deliberately small bounded pool still uses a linear least-loaded scan. v2.1 intentionally does **not** replace this with a heap: for the default pool size, the simpler scan has lower reasoning and maintenance cost without creating a meaningful hot-path problem.

## Interceptors

Server interceptors form a small middleware boundary around method execution. They can authenticate metadata, enforce authorization, attach tracing, normalize tenant context or measure application-specific work without coupling those policies to the wire decoder.

```ts
import { ArgusError, ArgusServer, ArgusStatus } from "argus-rpc";

const server = new ArgusServer({
  interceptors: [
    async (payload, context, next) => {
      if (context.metadata.authorization !== "Bearer internal-token") {
        throw new ArgusError({
          code: "ARGUS_UNAUTHENTICATED",
          message: "Missing or invalid service credential",
          status: ArgusStatus.UNAUTHENTICATED
        });
      }

      return next(payload, context);
    }
  ]
});
```

## Status model

Argus errors carry a stable protocol-facing status instead of deriving machine-readable codes from arbitrary exception messages.

```text
CANCELLED            UNKNOWN
INVALID_ARGUMENT     DEADLINE_EXCEEDED
NOT_FOUND            ALREADY_EXISTS
PERMISSION_DENIED    RESOURCE_EXHAUSTED
FAILED_PRECONDITION  ABORTED
OUT_OF_RANGE         UNIMPLEMENTED
INTERNAL             UNAVAILABLE
DATA_LOSS            UNAUTHENTICATED
```

Retryability is explicit. Enabling retries does not mean retrying every application failure.

## Runtime metrics

`server.stats()` exposes bounded runtime state including active connections, method count, active/queued calls, completed/failed/cancelled calls, protocol failures, bytes, and cumulative latency buckets. The collector keeps aggregate counters and histogram buckets rather than retaining every request duration in memory.

Pool statistics expose created/available/unhealthy channels, channels currently carrying calls, total in-flight calls and acquisition waiters.

## Codec extension API

Argus v2 exposes `ArgusCodec`, `ArgusCodecRegistry`, `jsonCodec` and `rawCodec` as extension primitives. Codec registration is deterministic and duplicate names are rejected. Wire-level codec negotiation is intentionally separate from this API; registering a codec does not silently change an existing peer's framing contract.

## Failure semantics that are tested

The suite exercises more than happy-path request/response behavior:

- arbitrary TCP fragmentation and coalescing;
- deterministic randomized frame fragmentation;
- invalid magic/version/type/direction;
- hostile declared payload sizes before body arrival;
- uint32 message-ID boundary and wraparound collision avoidance;
- pending response-type confusion and invalid peer responses;
- multiple asynchronous handlers completing out of order;
- bounded server concurrency, queued cancellation and overload behavior;
- client deadline versus response races;
- explicit cancellation propagation and abort-aware retry backoff;
- connection-close cancellation of active handlers;
- failed bind followed by successful server listen retry;
- retry exhaustion and retry classification;
- pooled multiplexing, capacity wakeups and failed-channel replacement;
- circuit breaker validation and concurrent half-open races;
- keepalive behavior;
- socket writer backpressure and close-during-drain races;
- deep fragmented chunk queues and deep serialized write queues;
- interceptor short-circuiting;
- bounded metrics collection;
- structural complexity regression guards;
- benchmark executable and machine-readable output validation.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

CI executes the supported runtime matrix on Node **20, 22 and 24**. Node 22 additionally verifies package contents with `npm pack --dry-run` and executes the v2.1 hot-path benchmark smoke.

## Benchmarking

General RPC-vs-HTTP harness:

```bash
npm run bench
```

v2.1 engineering hot-path harness:

```bash
npm run bench:v2.1
```

The benchmark tooling reports environment and operation metadata and can emit machine-readable `RESULT_JSON` output. v2.1 CI intentionally does not fail on wall-clock thresholds; deterministic structural tests guard the complexity invariants while timings remain diagnostic evidence.

Argus intentionally publishes **no made-up headline throughput number** in this README. Performance figures are meaningful only with their commit, machine, Node version, workload and methodology.

See [docs/BENCHMARKS.md](docs/BENCHMARKS.md).

## Architecture

The codebase is separated by responsibility:

```text
src/
├── protocol/       frame contract, limits, direction rules, codecs
├── transport/      chunk queue, stream decoder, backpressure writer, state
├── rpc/            envelope, metadata, statuses, call context, interceptors
├── client/         calls, IDs, retry policy, pooling, circuit breaker
├── server/         dispatch, method registry, concurrency limiting
├── connection/     connection tracking, heartbeat, keepalive
├── observability/  bounded metrics primitives
└── errors/         structured Argus errors
```

Design rule: **protocol is bytes; transport is sockets; RPC is call semantics; client/server orchestrate; policy owns retry/pool/health; observability measures without changing correctness.**

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Protocol](docs/PROTOCOL.md)
- [Failure modes](docs/FAILURE_MODES.md)
- [Connection pool](docs/CONNECTION_POOL.md)
- [Heartbeats](docs/HEARTBEATS.md)
- [Retries](docs/RETRIES.md)
- [Testing](docs/TESTING.md)
- [Benchmarks](docs/BENCHMARKS.md)
- [Engineering invariants](docs/ENGINEERING_INVARIANTS.md)
- [Roadmap](docs/ROADMAP.md)
- [Changelog](CHANGELOG.md)

## Scope

Argus v2 deliberately concentrates on unary request/response RPC correctness and operational behavior. Streaming, flow-controlled stream windows, negotiated compression, service discovery and cross-language code generation are not disguised as completed features.

That scope is intentional: a small protocol with explicit failure semantics is more useful than a large feature list with undefined behavior under load or partial failure.

## Name

Argus is named after **Argus Panoptes**, the many-eyed guardian. The name maps naturally to the project's design goal: communication that remains aware of deadlines, connection health, retries, queue pressure and failures instead of treating the network as an invisible pipe.

## License

Argus Source License. See [LICENSE](LICENSE).

## Author

Built by **Williams Ashibuogwu (`wbizmo`)**.
