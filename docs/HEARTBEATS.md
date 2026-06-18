# Heartbeats

Argus uses heartbeat frames to verify that a connection is still alive.

Heartbeat behavior is implemented using two frame types:

```txt
PING
PONG
```

## Purpose

TCP connections can fail in ways that are not always immediately obvious to application code.

A heartbeat gives Argus a protocol-level way to check whether the remote peer is still responsive.

## PING

A `PING` frame is sent by a client to check connection health.

The frame uses:

```txt
TYPE = PING
METHOD = ""
PAYLOAD = empty
```

## PONG

A server responds to a `PING` frame with a matching `PONG` frame.

The response keeps the same message ID so the client can correlate the heartbeat response.

```txt
TYPE = PONG
MESSAGE_ID = same as PING
METHOD = ""
PAYLOAD = empty
```

## Client Behavior

The client exposes:

```ts
await client.ping()
```

A successful heartbeat resolves to:

```ts
true
```

A failed heartbeat throws an error such as:

```txt
ARGUS_PING_TIMEOUT
```

## Server Behavior

The server listens for `PING` frames and immediately writes back a `PONG` frame.

Heartbeat frames do not pass through the method registry.

## Why Heartbeats Matter

Heartbeats support the Argus reliability model:

* Detect dead peers
* Verify socket responsiveness
* Support connection health checks
* Help connection pools avoid unhealthy sockets
* Make network state more observable

## Philosophy

Argus is designed around vigilance.

A protocol that cannot observe its connections cannot reason about failure.

Heartbeats give Argus one of its simplest forms of awareness.
