# Deadlines and cancellation

Argus v2 treats timeouts as distributed call lifecycle events rather than local promise timers.

A v2 request carries an absolute Unix-millisecond deadline in its request envelope. The server checks the deadline before handler execution and schedules cancellation for the remaining duration. Handlers receive an `AbortSignal` through `ArgusCallContext` and should stop downstream work promptly when it aborts.

When a caller timeout or user `AbortSignal` wins the local race, the client removes the pending request first and then sends a best-effort `CANCEL` frame using the same message ID. A response or error arriving after local settlement is ignored because the ID is no longer pending.

## Race guarantees

- A call settles at most once.
- Cancellation before dispatch prevents handler work when the queued call reaches execution.
- Cancellation during execution aborts the handler context signal.
- A late response cannot resurrect a timed-out or cancelled call.
- Duplicate active message IDs on one connection are rejected.
- Connection closure aborts all active handler contexts owned by that connection.

Cancellation is cooperative inside user handlers. Argus stops awaiting cancelled work and signals the handler; application code and downstream libraries should honor the provided `AbortSignal` to stop their own computation or I/O.
