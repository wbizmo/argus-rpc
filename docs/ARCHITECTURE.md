# Architecture

Argus is built around a small set of focused runtime components.

```txt
Client
  ↓
Retry Layer
  ↓
Connection Pool
  ↓
TCP Socket
  ↓
Binary Decoder
  ↓
Argus Server
  ↓
Method Registry
  ↓
Handler
```

## Client Responsibilities

The client is responsible for:

* Creating requests
* Assigning message IDs
* Tracking pending requests
* Managing timeouts
* Sending heartbeats
* Retrying failed calls
* Reusing pooled connections

## Server Responsibilities

The server is responsible for:

* Accepting TCP connections
* Decoding frames
* Executing registered methods
* Returning responses
* Returning structured errors
* Cleaning up dead connections

## Method Registry

Methods are registered by name.

Example:

```ts
server.method("user.get", async (payload) => {
  return {
    id: payload.id,
    name: "Williams"
  };
});
```

## Reliability Model

Argus is built around awareness of connection state.

Every request receives a message ID.

Every pending request can timeout.

Every connection can be monitored through heartbeats.

Every dead connection can be removed.

Every failed request can be retried.

This reliability model reflects the core Argus philosophy of vigilance through observability.
