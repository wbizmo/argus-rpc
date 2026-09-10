# Changelog

All notable changes to Argus RPC are documented here.

## v2.1.0 — Hot-Path Efficiency & State-Machine Hardening

Argus v2.1 is wire-compatible with v2.0.0. The release focuses on removing accidental quadratic work, tightening cancellation/state-machine correctness, and making performance claims reproducible rather than anecdotal.

### Client correctness and cancellation

- removed the per-request `new Set(this.pending.keys())` snapshot from message-ID allocation;
- message-ID allocation now checks the live pending map directly, avoiding O(n) temporary allocation in the common path and O(n²)-style aggregate work during large concurrent bursts;
- pending operations record whether they are RPC calls or pings;
- unexpected response kinds are rejected instead of allowing a `PONG` to resolve an RPC call or a normal response to silently settle a ping;
- retry backoff is abort-aware, so cancellation no longer waits for an unrelated sleep interval to finish;
- retry elapsed-time budgeting remains bounded by the original call deadline.

### Server and circuit-breaker state machines

- queued server calls now observe cancellation before execution and release queued capacity instead of remaining resident until dispatch;
- concurrency-limiter dequeueing uses a head cursor instead of repeated `Array.shift()` reindexing;
- failed `listen()` attempts clear stale server state so a later retry can bind successfully;
- circuit-breaker configuration now rejects invalid half-open call limits;
- concurrent half-open probes cannot race a later success against an earlier failure and incorrectly close a reopened circuit;
- regression coverage was added for failed-bind recovery, cancellation while queued, deep queues and concurrent half-open probes.

### Transport and pool hot paths

- `ChunkQueue` retires consumed chunks with a head cursor and bounded occasional compaction instead of shifting the backing array for every exhausted chunk;
- `SocketWriter` retires queued writes with a head cursor while preserving callback + `drain` backpressure semantics and close-race safety;
- connection-pool waiters use logical active state and a head cursor instead of repeated `shift`, `indexOf` and `splice` operations;
- newly created multiplexed connections wake waiters according to actual spare per-connection capacity;
- retired connections no longer trigger duplicate capacity notifications;
- the deliberately small least-loaded connection scan remains linear by design rather than introducing a heap whose complexity would not pay for itself at the default pool size.

### Protocol and allocation efficiency

- encoder method bytes are produced once and their derived length is reused;
- public protocol boundaries remain defensive while internal stream decoding reuses already-normalized limits and already-parsed headers;
- per-frame `Object.values(...).includes(...)` message-type enumeration was replaced with constant-time validation;
- remote status validation no longer enumerates the status enum for every error;
- server method-count statistics now use the registry map size instead of sorting all method names merely to count them.

### Security posture

- non-loopback raw-TCP server binds are refused by default because Argus transport is plaintext;
- remote binds require explicit `allowInsecureRemote: true`, intended only when encryption/authentication is supplied by a trusted outer boundary such as TLS termination, WireGuard or a service mesh;
- wire protocol v2 remains unchanged in v2.1.

### Benchmarking and complexity regression guards

- added `npm run bench:v2.1` for message-ID allocation, fragmented chunk queues, concurrency-limiter draining and protocol encode/decode hot paths;
- v2.1 benchmark output records commit/runtime/CPU/config metadata and emits a machine-readable `RESULT_JSON` record;
- same-process legacy reference implementations are included for the removed pending-ID snapshot and `Array.shift()` chunk behavior;
- CI runs a v2.1 benchmark smoke on Node 22, but deliberately does not gate on noisy wall-clock thresholds;
- deterministic structural regression tests guard against reintroducing the identified quadratic/allocation patterns;
- benchmark documentation now separates measured evidence from universal performance claims.

### Verification

The v2.1 release checkpoint contains **156 tests across 39 files**. CI verifies Node 20, 22 and 24 with clean install, strict TypeScript typecheck, the full unit/integration/adversarial suite and package build. Node 22 additionally runs `npm pack --dry-run` and the v2.1 hot-path benchmark smoke.

### Compatibility

- Argus v2.1.0 and v2.0.0 use the same Argus v2 wire protocol;
- no v2 wire migration is required;
- the release is a semver-minor runtime/engineering hardening update rather than a protocol-version bump.

---

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
