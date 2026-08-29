# Connection pooling

Argus v2 treats a TCP connection as a multiplexed channel, not as a single-use request slot.

## Selection model

`ArgusConnectionPool` chooses the healthy channel with the fewest in-flight calls. Each channel accepts up to `maxConcurrentPerConnection` active RPCs. A new channel is created only when existing channels are saturated and the configured `size` has not been reached.

If every channel is saturated, callers wait for capacity with a bounded `acquireTimeoutMs`; the pool does not immediately fail simply because another RPC is using each socket.

## Failure handling

Only transport-class failures retire a channel. Application errors such as `INVALID_ARGUMENT` or `FAILED_PRECONDITION` leave the underlying TCP connection healthy and reusable.

A retired channel is removed from the pool before replacement decisions are made. This prevents the v1 failure mode where dead entries remained in the array, permanently consumed the configured size, and eventually caused `ARGUS_POOL_EXHAUSTED` despite having no usable connections.

## Circuit breaker

Pools use a circuit breaker by default. Retryable transport failures count toward the breaker; normal application failures do not. The breaker transitions through `CLOSED`, `OPEN`, and `HALF_OPEN` and bounds probe traffic during recovery. Set `circuitBreaker: false` when an external resilience layer owns this policy.

## Useful stats

`pool.stats()` reports configured size, channels created, available and in-use channel counts, unhealthy entries, aggregate in-flight calls, and acquisition waiters.
