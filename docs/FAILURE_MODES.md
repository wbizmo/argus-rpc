# Failure Modes

Argus treats failure handling as a core part of the protocol.

The goal is not only to make successful requests work, but to make broken communication observable, predictable, and testable.

## Unknown Methods

When a client calls a method that has not been registered on the server, the server returns a structured error frame.

Expected code:

```txt
ARGUS_METHOD_NOT_FOUND
```

This proves that method lookup failures are handled at the protocol layer instead of becoming silent socket failures.

## Invalid Frames

Invalid binary frames are rejected.

Examples include:

* Invalid magic bytes
* Unsupported protocol version
* Invalid message type
* Incomplete payload
* Corrupted frame layout

Invalid frames produce an error response when possible.

## Malformed Payloads

Argus v1 uses JSON payload serialization while keeping binary framing explicit.

Malformed JSON payloads are handled as request failures and returned as structured error responses.

## Request Timeouts

Every pending client request can timeout.

Expected code:

```txt
ARGUS_REQUEST_TIMEOUT
```

Timeouts prevent the client from waiting forever when a server is slow, unavailable, or unable to respond.

## Connection Closure

When a client or server closes a connection, pending requests are rejected.

Expected codes may include:

```txt
ARGUS_CLIENT_CLOSED
ARGUS_CONNECTION_CLOSED
```

## Heartbeat Failure

Heartbeat behavior is based on `PING` and `PONG` frames.

A healthy connection should respond to `PING` with `PONG`.

If heartbeat responses are not received within the expected timeout window, the caller can treat the connection as unhealthy.

## Retry Exhaustion

Retry logic attempts failed operations using exponential backoff.

If all retry attempts fail, the last error is surfaced to the caller.

This ensures retry behavior does not hide permanent failures.

## Pool Failure

The connection pool tracks healthy and unhealthy clients.

Unhealthy sockets are closed and should not be reused.

If the pool cannot provide a usable connection, it throws:

```txt
ARGUS_POOL_EXHAUSTED
```

## Design Principle

Argus is named after Argus Panoptes, the many-eyed guardian known for vigilance.

Failure-mode handling is where that philosophy becomes real:

* Every request is tracked.
* Every timeout is surfaced.
* Every malformed frame is rejected.
* Every connection can be observed.
* Every dead peer should eventually be detected.
