# Argus RPC v2 Architecture

Argus is intentionally compact, but v2 separates wire parsing, socket mechanics, call semantics and reliability policy so failure handling does not become one large client/server class.

## Layer boundaries

```text
Application
    │
    ▼
┌───────────────────────────────────────────────┐
│ RPC semantics                                │
│ call context · deadlines · metadata · status │
│ cancellation · interceptors                  │
└───────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────┐
│ Client / server orchestration                 │
│ correlation · dispatch · methods · limits     │
│ retries · pools · concurrency                 │
└───────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────┐
│ Transport                                     │
│ chunk queue · stream decoder · socket writer  │
│ connection state · backpressure               │
└───────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────┐
│ Protocol                                      │
│ frame bytes · field widths · types · limits   │
│ direction validation · codec primitives       │
└───────────────────────────────────────────────┘
    │
    ▼
TCP
```

The rule is simple: **protocol owns bytes, transport owns sockets, RPC owns call semantics, policy owns retries/pooling/health, and observability watches without deciding correctness.**

## Protocol

`src/protocol`

The protocol layer defines the 14-byte v2 frame header, message types, frame encoding/decoding, direction rules, runtime limits and codec extension primitives.

Important invariants:

- field widths are validated before encoding;
- declared method/payload lengths are checked against practical limits before waiting for the body;
- client/server frame direction is explicit;
- message IDs are uint32 wire values;
- malformed framing is a protocol error, not an application error;
- codec registration does not silently alter a peer's wire contract.

The protocol functions remain usable independently of a live socket, which keeps parser tests deterministic.

## Transport

`src/transport`

TCP does not preserve application frame boundaries. The transport layer therefore treats incoming data as an arbitrary chunk stream.

### Incremental decoding

`ChunkQueue` retains received chunks without repeatedly concatenating the entire pending buffer. `ArgusFrameStreamDecoder` consumes complete frames and leaves incomplete data queued for the next socket event.

This covers both important TCP cases:

- one Argus frame split across many reads;
- many Argus frames coalesced into one read.

### Writes and backpressure

`SocketWriter` serializes writes and tracks queued bytes. If Node's `socket.write()` returns `false`, completion waits for both the write callback and `drain` before advancing the queue.

The queue has a hard byte limit. A burst that exceeds it fails explicitly instead of allowing process memory to grow without a bound.

The writer also defends the close-versus-drain race: closing rejects queued promises exactly once, resets accounting, and late callbacks cannot underflow queue bytes or revive the writer.

## RPC semantics

`src/rpc`

The v2 request envelope carries the application payload, absolute deadline and normalized metadata.

`ArgusCallContext` passed to handlers contains:

- message ID;
- method;
- peer address/port;
- start time;
- optional absolute deadline;
- metadata;
- `AbortSignal`.

Server interceptors wrap method execution and can stop a call before the handler, which provides a clean boundary for authentication, authorization, tracing and application policy.

Canonical statuses make remote behavior stable even when underlying JavaScript exceptions differ.

## Client call lifecycle

`src/client/ArgusClient.ts`

A unary call follows this state progression:

```text
allocate id
   │
   ▼
encode request envelope
   │
   ▼
register pending call
   │
   ├──────── response/error ───────► settle once
   │
   ├──────── deadline ─────────────► remove + CANCEL + reject
   │
   ├──────── AbortSignal ──────────► remove + CANCEL + reject
   │
   ├──────── write failure ────────► remove + reject
   │
   └──────── connection close ─────► reject all pending
```

Pending calls are inserted before the asynchronous write can fail, so failure cleanup always has a single correlation record to settle.

The message-ID allocator wraps within the uint32 space and skips IDs that are still pending. ID `0` is reserved away from ordinary client allocation.

Concurrent `connect()` calls share one connection promise rather than opening racing sockets.

## Server dispatch and concurrency

`src/server`

Decoded frames are dispatched independently. The server does **not** await one handler before starting the next frame from the same socket.

A global `ConcurrencyLimiter` bounds active handler executions and queued work. When both limits are exhausted, overload is explicit instead of silently accumulating an unbounded promise/task backlog.

Because responses include the original message ID, asynchronous methods can complete out of order without corrupting request/response association.

Active call IDs are tracked per connection. A duplicate live ID is rejected so two handlers cannot race to answer the same correlation key.

## Deadline and cancellation races

Deadlines are absolute timestamps propagated by the client. The server checks an already-expired deadline before handler execution and arms an abort timer for live deadlines.

A call owns one `AbortController`. Any of these events can win:

- peer `CANCEL` frame;
- deadline timer;
- socket close.

The handler promise is raced against the abort signal. Cleanup checks controller identity before deleting the active-call map entry, preventing a late completion from deleting a newer call that might reuse the same ID after the old call has fully settled.

Handlers that start downstream work should pass `context.signal` onward; cancellation cannot forcibly stop arbitrary user code that ignores its signal.

## Retry policy

Retries are client-side policy, not a property of every error.

The retry loop has:

- bounded attempts;
- exponential backoff;
- jitter;
- maximum delay;
- maximum elapsed time;
- explicit classification / override hook.

Application errors are not transient merely because they crossed an RPC boundary. Non-idempotent operations should not opt into retries without an application-level duplicate-suppression strategy.

## Connection pool

`src/client/connection-pool.ts`

Pool capacity is measured in multiplexed in-flight calls, not a boolean "socket in use" flag.

Each channel tracks its in-flight count. Selection chooses the least-loaded healthy channel under `maxConcurrentPerConnection`. If all channels are full, acquisition waits in a bounded FIFO-ish waiter queue until capacity appears or `acquireTimeoutMs` expires.

Transport-failed channels are removed before replacement, so a dead object cannot permanently consume the configured pool size.

The circuit breaker wraps pooled call operations and reacts to transport/service availability failures rather than treating ordinary application validation errors as evidence that the network is unhealthy.

## Connection health

`src/connection`

PING/PONG remains a protocol primitive. The keepalive controller adds periodic probes, timeout/miss accounting and RTT measurement that higher-level channel policy can consume.

Connection state is represented explicitly rather than inferred from one socket boolean, allowing code to distinguish connecting, ready, draining/failure and closed phases.

## Observability

`src/observability`

Argus uses aggregate counters and cumulative histogram buckets. It does not retain one object or latency sample per completed RPC.

Server metrics cover call outcomes, active/queued work, protocol failures and transport volume. Pool stats expose channel and waiter pressure.

The observability layer is intentionally passive: metrics should describe the runtime, not change scheduling or error semantics.

## Trust boundaries

A remote peer controls frame bytes, method names, payload contents, ordering and timing. Argus therefore validates these inputs before handing them to application code.

The runtime does not claim that raw TCP is encrypted or authenticated. Deployments that need confidentiality and peer identity must provide an appropriate secure network/TLS boundary and should enforce service credentials through interceptors/metadata.

Do not invent protocol cryptography inside application handlers.

## Testing model

The architecture is tested at several layers:

- pure frame and limit unit tests;
- arbitrary fragmentation/coalescing tests;
- deterministic randomized fragmentation fuzzing;
- writer backpressure/lifecycle tests;
- client/server TCP integration tests;
- concurrency and out-of-order completion tests;
- deadline/cancellation race tests;
- retry/pool/circuit-breaker tests;
- failure-mode tests with raw sockets;
- benchmark executable validation.

See `docs/TESTING.md`, `docs/FAILURE_MODES.md`, and `docs/MIGRATION_V2.md`.
