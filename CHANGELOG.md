# Changelog

All notable changes to Argus RPC are documented here.

## v2.0.0 — Protocol, Reliability & Concurrency Rewrite

Argus v2 is a wire-incompatible protocol revision focused on bounded resource use, correct concurrent behavior and explicit distributed-call semantics.

### Protocol

- bumped the wire version from `1` to `2`;
- retained the compact 14-byte fixed header;
- added `CANCEL` as a first-class message type;
- formalized client-to-server and server-to-client frame direction rules;
- added configurable practical protocol limits;
- reject oversized declared method/payload/frame lengths before waiting for frame bodies;
- enforce the uint32 message-ID wire range;
- added a collision-safe message-ID allocator with wraparound and live-ID avoidance;
- added codec extension primitives, a deterministic codec registry, and built-in JSON/raw codecs.

### Transport

- replaced repeated receive-buffer concatenation with a chunk queue and incremental stream decoder;
- correctly handles arbitrary TCP fragmentation and coalescing;
- added a serialized socket writer that observes Node backpressure;
- added a bounded queued-write byte budget;
- fixed close-versus-drain/callback races so queued bytes cannot underflow and writes settle once;
- added explicit connection-state primitives.

### Call lifecycle

- added absolute deadline propagation from client to server;
- added best-effort wire cancellation when callers abort or deadlines expire;
- handlers now receive `ArgusCallContext` with peer data, metadata, deadline and `AbortSignal`;
- active server calls are aborted on connection loss;
- duplicate live message IDs are rejected;
- late responses after local settlement are ignored safely;
- concurrent connect attempts share one connection promise.

### Concurrency and overload

- server frames are no longer serially awaited one-by-one from a decoded batch;
- asynchronous handlers can complete out of order while message IDs preserve correlation;
- added a bounded global concurrency limiter;
- added a bounded queued-call limit and explicit overload behavior;
- added tests that prove out-of-order completion rather than only concurrent invocation of synchronous handlers.

### Error model

- introduced canonical RPC statuses:
  `CANCELLED`, `UNKNOWN`, `INVALID_ARGUMENT`, `DEADLINE_EXCEEDED`, `NOT_FOUND`, `ALREADY_EXISTS`, `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`, `FAILED_PRECONDITION`, `ABORTED`, `OUT_OF_RANGE`, `UNIMPLEMENTED`, `INTERNAL`, `UNAVAILABLE`, `DATA_LOSS`, and `UNAUTHENTICATED`;
- arbitrary JavaScript exception messages are no longer promoted into stable machine error codes;
- errors can carry explicit retryability and structured details;
- remote error reconstruction preserves canonical status semantics.

### Retry policy

- retries remain opt-in;
- replaced retry-everything defaults with transient-aware classification;
- added bounded exponential backoff;
- added jitter;
- added maximum elapsed retry budget;
- preserved an explicit `shouldRetry` policy hook;
- deadlines bound the total retry lifecycle instead of restarting a full timeout per attempt.

### Connection pooling and health

- rewrote the pool around multiplexed channels instead of one-request-per-connection locks;
- added per-connection in-flight limits;
- selection now prefers the least-loaded healthy channel;
- pool saturation waits for bounded capacity rather than immediately exhausting;
- dead transport channels are removed and can be recreated;
- retry/client options are preserved when pooled clients are created;
- added configurable circuit breaking for pooled calls;
- application errors do not automatically poison transport health;
- added keepalive primitives with RTT and missed-probe accounting.

### Extensibility and policy

- added normalized per-call metadata;
- added composable server interceptors;
- authentication, authorization, tracing and tenant policy can short-circuit before handler execution;
- separated protocol bytes, transport mechanics, RPC semantics and reliability policy into clearer modules.

### Observability

- expanded server runtime statistics beyond connection/method counts;
- added bounded counters and cumulative histograms for call/transport behavior;
- metrics do not retain unbounded per-call samples;
- pool statistics expose channel utilization, total in-flight calls and acquisition waiters.

### Security and resource hardening

- hostile frame-size declarations are rejected from header metadata alone;
- method, payload, frame, queued-write, active-call and queued-call resource budgets are bounded;
- invalid frame direction is a protocol violation;
- malformed peers cannot leave the parser in an endless invalid-buffer loop;
- documentation now states the raw-TCP trust boundary explicitly rather than implying transport encryption/authentication.

### Testing

The v2 release checkpoint contains 128 tests across 37 files, including:

- encoder/decoder and protocol edge cases;
- practical frame-limit enforcement;
- deterministic randomized fragmentation fuzzing;
- chunk-stream fragmentation/coalescing;
- message-ID wraparound;
- backpressure writer lifecycle races;
- concurrent and out-of-order calls;
- deadline and cancellation races;
- connection loss during active work;
- retries and exhaustion;
- multiplexed pooling;
- circuit breaking;
- keepalive behavior;
- interceptor short-circuiting;
- bounded metrics;
- benchmark executable validation.

CI verifies Node 20, 22 and 24 with install, strict typecheck, tests and build. Node 22 additionally validates package contents with `npm pack --dry-run`.

### Benchmarking

- added configurable warmup;
- HTTP baseline now uses keep-alive with a concurrency-matched socket ceiling;
- added error rate, p50, p90, p95, p99 and max latency;
- added runtime, OS, architecture and CPU metadata;
- added optional machine-readable result output;
- documented a reproducible benchmark publication methodology;
- removed example numbers from the documentation so sample output cannot be mistaken for measured Argus performance.

### Package and repository hygiene

- synchronized package/runtime version metadata at `2.0.0`;
- added modern package `exports` metadata;
- declared supported Node versions;
- added explicit typecheck/package verification scripts;
- repaired the Replit-generated lockfile so it uses the public npm registry and correct package identity;
- added contribution, support and security guidance;
- rebuilt the README around actual v2 specifications and verified engineering behavior.

### Breaking changes

- v1 and v2 peers are not wire-compatible;
- timeout code `ARGUS_REQUEST_TIMEOUT` is superseded by `ARGUS_DEADLINE_EXCEEDED` with canonical status `DEADLINE_EXCEEDED`;
- practical frame limits can reject payload sizes that v1 would have attempted to buffer;
- retry behavior is intentionally more conservative;
- pool semantics are multiplexed rather than exclusive-per-call.

See `docs/MIGRATION_V2.md` before upgrading an existing v1 deployment.

---

## v1.0.0

Initial stable release.

### Added

#### Protocol

- binary frame protocol;
- protocol versioning;
- message IDs;
- request/response correlation;
- structured error frames;
- UTF-8 method support;
- JSON payload serialization.

#### Networking

- TCP server;
- TCP client;
- method registry;
- concurrent request handling.

#### Reliability

- request timeouts;
- PING/PONG heartbeats;
- retry support;
- exponential backoff;
- connection cleanup;
- connection pooling.

#### Testing and tooling

- unit, integration, failure-mode and concurrency tests;
- benchmark validation;
- TypeScript + tsup build pipeline;
- Vitest;
- GitHub Actions CI;
- architecture/protocol/reliability documentation.
