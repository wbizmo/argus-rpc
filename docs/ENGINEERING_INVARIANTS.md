# Argus RPC engineering invariants

Argus v2 is built around explicit invariants that are testable at protocol boundaries.

## Protocol

- A frame is either complete and valid or rejected without partially dispatching it.
- Declared lengths are checked against configured limits before the runtime waits for or allocates the declared body.
- Message IDs are unsigned 32-bit values. An ID is never reused while a call with that ID is still pending.
- A peer may only send frame types valid for its side of the connection.

## Calls

- A call settles at most once.
- A timeout or cancellation removes client bookkeeping and may propagate cancellation to the server.
- A late response cannot settle a timed-out or cancelled call.
- Server work is bounded by configured concurrency rather than the amount of input a peer can enqueue.

## Transport

- Backpressure from `socket.write()` is honored.
- Queued outbound bytes are bounded.
- Socket close/error events reject affected work and cannot leave a connection permanently in an intermediate state.

## Reliability

- Retries are opt-in for retryable failures and must respect idempotency policy.
- Retry delay uses bounded exponential backoff with jitter.
- Unhealthy pool entries are replaceable and do not permanently consume capacity.

## Shutdown

- Draining stops acceptance of new work while permitting active work to finish within a grace period.
- Cleanup is idempotent. Closing a client, pool, or server repeatedly is safe.
