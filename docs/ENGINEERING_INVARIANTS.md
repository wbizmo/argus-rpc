# Argus RPC engineering invariants

Argus v2 is built around explicit invariants that are testable at protocol boundaries.

## Protocol

- A frame is either complete and valid or rejected without partially dispatching it.
- Declared lengths are checked against configured limits before the runtime waits for or allocates the declared body.
- Message IDs are unsigned 32-bit values. An ID is never reused while a call with that ID is still pending.
- Message-ID allocation queries the live pending collection directly; it does not copy all active IDs for each request.
- A peer may only send frame types valid for its side of the connection.
- Pending calls and pings accept only their valid completion frame types. A `PONG` cannot satisfy a normal RPC request and a `RESPONSE` cannot satisfy a ping.
- Protocol limits are normalized at defensive public boundaries and reused internally when already validated.

## Calls

- A call settles at most once.
- A timeout or cancellation removes client bookkeeping and may propagate cancellation to the server.
- Cancellation applies while retrying, sleeping in backoff, waiting in the server concurrency queue and executing a handler.
- Cancelled queued work stops consuming effective queue capacity before it reaches execution.
- A late response cannot settle a timed-out or cancelled call.
- Server work is bounded by configured concurrency rather than the amount of input a peer can enqueue.

## FIFO hot paths

- Transport and scheduling FIFOs do not repeatedly remove array index zero.
- `ConcurrencyLimiter`, `ChunkQueue`, `SocketWriter` and pool-capacity waiters use logical head cursors with bounded occasional compaction.
- Enqueue and ordinary dequeue/retirement are O(1)-average/amortized for those queues.
- Deliberately small bounded collections remain simple: the connection pool keeps its linear least-loaded scan unless measurements justify a more complex structure.

## Transport

- Backpressure from `socket.write()` is honored.
- Queued outbound bytes are bounded.
- A backpressured write completes only after its write callback and, when required, `drain`.
- `SocketWriter` owns and removes only the listeners it installed; it does not remove unrelated consumer listeners.
- Socket close/error events reject affected work and cannot leave a connection permanently in an intermediate state.

## Reliability

- Retries are opt-in for retryable failures and must respect idempotency policy.
- Retry delay uses bounded exponential backoff with jitter and is abort-aware.
- Circuit-breaker recovery cannot be closed by a stale half-open success after a newer probe has reopened the circuit.
- Unhealthy pool entries are replaceable and do not permanently consume capacity.
- Pool waiter timeout/close races settle each waiter at most once.

## Lifecycle

- A failed server bind returns the server to a reusable non-listening state.
- Successful double-listen attempts are rejected.
- Runtime stats use direct cardinality where available rather than allocating/sorting data merely to count it.

## Simplicity rule

- Prefer the smallest implementation that makes the invariant obvious.
- Do not add a dependency or generalized data structure when a local head cursor is sufficient.
- Do not reduce line count by hiding race state, weakening validation, or making cleanup ownership ambiguous.
- Avoid recomputing immutable derived facts such as method byte lengths, normalized limits and parsed frame headers inside one operation.
- Optimize measured or structurally demonstrated hot paths; do not replace simple bounded linear work merely for a better asymptotic label.

## Shutdown

- Cleanup is idempotent. Closing a client, pool, or server repeatedly is safe.
- Closing a pool rejects outstanding capacity waiters exactly once.
- Closing a socket writer rejects queued writes exactly once and leaves no writer-owned stale `drain` listener.
