# Argus RPC

**TypeScript RPC over persistent TCP.**

Binary framing · multiplexed calls · distributed deadlines · cancellation · bounded backpressure · health-aware pooling · observable by design

[![CI](https://github.com/wbizmo/argus-rpc/actions/workflows/ci.yml/badge.svg)](https://github.com/wbizmo/argus-rpc/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/wbizmo/argus-rpc)](https://github.com/wbizmo/argus-rpc/releases)
![Node](https://img.shields.io/badge/node-20%20%7C%2022%20%7C%2024-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)

Argus RPC is a compact RPC runtime and wire protocol built from first principles in TypeScript. It uses persistent TCP connections, a small binary frame header and message IDs to multiplex independent calls without imposing HTTP semantics on the transport.

Version 2 focuses on the parts that make protocol implementations difficult in practice: hostile frame lengths, fragmented reads, write backpressure, concurrent completion ordering, message-ID wraparound, deadlines, cancellation races, retries, overloaded servers, failed pooled connections and bounded observability.

Argus is an infrastructure engineering project, not a claim that every system should replace HTTP or gRPC.

## At a glance

| Capability | Argus RPC v2 |
| --- | --- |
| Transport | persistent TCP |
| Wire protocol | Argus v2 |
| Frame header | 14 bytes, big-endian integer fields |
| Multiplexing | yes, responses correlate by uint32 message ID |
| Request concurrency | bounded server execution + bounded queue |
| Deadlines | absolute deadline propagated to the server |
| Cancellation | `CANCEL` frame + handler `AbortSignal` |
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
| Test suite | **128 tests across 37 files** at the v2 release checkpoint |

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
- multiple asynchronous handlers completing out of order;
- bounded server concurrency and overload behavior;
- client deadline versus response races;
- explicit cancellation propagation;
- connection-close cancellation of active handlers;
- retry exhaustion and retry classification;
- pooled multiplexing and failed-channel replacement;
- circuit breaker state changes;
- keepalive behavior;
- socket writer backpressure and close-during-drain races;
- interceptor short-circuiting;
- bounded metrics collection;
- benchmark executable validation.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

CI executes the supported runtime matrix on Node **20, 22 and 24**. Node 22 additionally verifies the package contents with `npm pack --dry-run`.

## Benchmarking

```bash
npm run bench
```

The benchmark reports error rate, average latency, p50/p90/p95/p99/max latency and requests per second after a configurable warmup. It also emits runtime/CPU metadata and can produce a machine-readable JSON record.

Argus intentionally publishes **no made-up headline throughput number** in this README. Performance figures are meaningful only with their commit, machine, Node version, request count, concurrency, payload shape and methodology.

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
- [Roadmap](docs/ROADMAP.md)

## Scope

Argus v2 deliberately concentrates on unary request/response RPC correctness and operational behavior. Streaming, flow-controlled stream windows, negotiated compression, service discovery and cross-language code generation are not disguised as completed features.

That scope is intentional: a small protocol with explicit failure semantics is more useful than a large feature list with undefined behavior under load or partial failure.

## Name

Argus is named after **Argus Panoptes**, the many-eyed guardian. The name maps naturally to the project's design goal: communication that remains aware of deadlines, connection health, retries, queue pressure and failures instead of treating the network as an invisible pipe.

## License

Argus Source License. See [LICENSE](LICENSE).

## Author

Built by **Williams Ashibuogwu (`wbizmo`)**.
