# Roadmap

Argus is developed in release-sized engineering passes rather than feature-count sprints. Completed work is kept here so the roadmap reflects what the runtime actually does today.

## v1.0.0 — Initial Stable Runtime

Completed:

- binary frame protocol and versioning;
- TCP client/server request-response RPC;
- message IDs and request correlation;
- structured errors and timeouts;
- PING/PONG heartbeats;
- retries and exponential backoff;
- connection pooling;
- unit, integration, failure-mode and benchmark validation;
- architecture, protocol and reliability documentation.

## v2.0.0 — Protocol, Reliability & Concurrency Rewrite

Completed:

- Argus wire protocol v2 and explicit `CANCEL` frames;
- distributed deadlines and handler `AbortSignal` cancellation;
- true multiplexed, out-of-order completion;
- bounded server concurrency and overload queueing;
- incremental fragmented TCP decoding with practical frame limits;
- bounded backpressure-aware writes;
- canonical RPC statuses and retryability;
- transient-aware retry policy with jitter and elapsed-time budgets;
- multiplexed least-loaded connection pooling;
- failed-channel retirement/replacement;
- circuit breaker and keepalive primitives;
- metadata, interceptors, bounded metrics and codec extension primitives;
- reproducible benchmark methodology;
- zero runtime dependencies.

## v2.1.0 — Hot-Path Efficiency & State-Machine Hardening

Completed:

- removed O(n) pending-ID snapshots from request allocation;
- removed repeated front-of-array dequeue work from chunk, write, limiter and pool-waiter hot paths;
- cancellation-aware queued server work and retry backoff;
- strict call/ping response-kind correlation;
- failed-listen recovery;
- circuit-breaker half-open validation and race hardening;
- reduced repeated protocol normalization, enum enumeration and frame-size work;
- constant-time server method-count statistics;
- structural complexity regression tests;
- dedicated v2.1 hot-path benchmark with machine-readable output;
- plaintext remote-bind refusal by default unless an external trusted transport boundary is explicitly acknowledged.

## Next Engineering Candidates

These are candidates, not committed release promises:

- TLS-native transport support or a first-class secure transport adapter;
- streaming RPC with explicit flow-control windows;
- negotiated compression and codec capabilities;
- service discovery / endpoint resolution policy;
- cross-language protocol fixtures and interoperability tests;
- richer benchmark sweeps across payload sizes and connection-pool shapes;
- deployment reference environments for private-network and public TCP use cases.

The project will continue to prefer small, testable protocol/runtime invariants over adding features whose failure behavior is undefined.
