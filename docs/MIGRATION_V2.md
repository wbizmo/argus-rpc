# Migrating from Argus RPC v1 to v2

Argus v2 is a deliberate wire-protocol revision. A v1 peer and a v2 peer reject each other's frames because the protocol version byte changed from `1` to `2`.

Do not perform an uncoordinated rolling deployment where v1 and v2 processes are expected to communicate directly. Upgrade both sides of an Argus link together, or run separate v1/v2 listeners during a migration window.

## What changed

### Wire version

`ARGUS_VERSION` is now `2`.

The fixed frame header remains 14 bytes, but v2 adds the `CANCEL` message type and gives unary calls explicit deadline/cancellation semantics.

### Request payload envelope

Client calls now send a v2 request envelope containing:

- the application payload;
- an absolute `deadlineUnixMs` when a timeout is configured;
- normalized per-call metadata.

Applications should continue to use `ArgusClient.call()` / `callWithOptions()` and `ArgusServer.method()` rather than constructing request envelopes manually.

### Handler context

Handlers can receive a second argument:

```ts
server.method("job.run", async (payload, context) => {
  context.signal.throwIfAborted();
  return runJob(payload, context.signal);
});
```

Existing one-argument handlers remain valid TypeScript functions, but long-running handlers should adopt `context.signal` so cancelled/deadline-expired work can stop promptly.

Context also exposes method name, message ID, peer information, start time, optional deadline and metadata.

### Timeout semantics

The old local-only timeout error code `ARGUS_REQUEST_TIMEOUT` has been replaced by `ARGUS_DEADLINE_EXCEEDED` with canonical status `DEADLINE_EXCEEDED`.

On deadline expiration the client settles the local promise and sends a best-effort `CANCEL` frame. The server aborts the handler signal when the deadline or cancellation wins the race.

### Errors

`ArgusError` now has a stable RPC status and explicit retryability in addition to code, message and details. Arbitrary JavaScript error messages are no longer promoted into protocol error codes.

If application code switches on error behavior, prefer `error.status` for protocol semantics and `error.code` for Argus/application-specific detail.

### Retries

Retries remain opt-in, but enabling retries no longer means retrying every thrown error. v2 defaults to transient-aware classification, exponential backoff with jitter and an overall elapsed-time budget.

For non-idempotent application methods, either keep retries disabled or provide a policy that is safe for that method's semantics.

### Connection pool

The pool is now multiplexed. A connection can carry multiple in-flight calls up to `maxConcurrentPerConnection`, and selection favors the least-loaded healthy channel.

Transport-failed channels are removed and can be recreated. Pool saturation waits for bounded capacity instead of immediately treating every busy channel as unavailable.

Relevant new options include:

```ts
new ArgusConnectionPool({
  port: 7000,
  size: 4,
  maxConcurrentPerConnection: 128,
  acquireTimeoutMs: 1000,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 5000
  }
});
```

### Protocol resource limits

v2 applies practical defaults before allocating/waiting for declared frame bodies:

- method names: 1 KiB UTF-8;
- payload: 8 MiB;
- total frame: default header + method + payload budget.

If v1 applications intentionally sent payloads larger than 8 MiB, configure `protocolLimits` on both client and server before upgrading.

### Backpressure

Writes now pass through a bounded serialized writer that respects Node socket backpressure. Extremely bursty applications can receive `ARGUS_WRITE_QUEUE_FULL` instead of allowing unbounded user-space write buffering.

Tune `maxQueuedWriteBytes` based on payload size and concurrency rather than disabling the bound.

### Metadata and interceptors

Use `callWithOptions(..., { metadata })` for per-call metadata. Server interceptors can authenticate or authorize before a method handler executes.

Metadata keys are normalized to lowercase and invalid/oversized entries are discarded by the envelope normalizer.

### Codec primitives

v2 exports `ArgusCodec`, `ArgusCodecRegistry`, `jsonCodec` and `rawCodec` for explicit serialization extensions. These primitives do not automatically negotiate a new wire encoding with peers.

## Suggested upgrade sequence

1. Upgrade development/test environments to Node 20, 22 or 24.
2. Update Argus on both ends of each RPC link.
3. Add cancellation handling to expensive/long-running server methods.
4. Review retry policies for idempotency.
5. Review configured frame/write queue limits against real payload sizes.
6. Update monitoring to consume the expanded server/pool statistics.
7. Run the full test suite and application integration tests.
8. Deploy v2 peers together or behind a version-separated migration boundary.

## Verification

For the Argus repository itself, the release gate is:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

The project CI runs Node 20, 22 and 24; package contents are additionally checked on Node 22.
