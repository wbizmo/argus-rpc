# Protocol Specification

Argus is a binary framed RPC protocol built on raw TCP.

## Frame Layout

```txt
MAGIC        2 bytes
VERSION      1 byte
TYPE         1 byte
MESSAGE_ID   4 bytes
METHOD_LEN   2 bytes
PAYLOAD_LEN  4 bytes
METHOD       variable
PAYLOAD      variable
```

Total fixed header size:

```txt
14 bytes
```

## Magic Bytes

Argus frames begin with:

```txt
AR
```

This identifies the payload as an Argus frame.

## Version

Current version:

```txt
1
```

Unsupported versions are rejected.

## Message Types

```txt
REQUEST
RESPONSE
ERROR
PING
PONG
```

### REQUEST

Sent by clients.

```txt
Client -> Server
```

### RESPONSE

Sent by servers.

```txt
Server -> Client
```

### ERROR

Represents structured protocol failures.

```txt
Server -> Client
```

### PING

Heartbeat request.

```txt
Client -> Server
```

### PONG

Heartbeat response.

```txt
Server -> Client
```

## Message IDs

Every request receives a message ID.

Responses reuse the same message ID.

This allows concurrent requests to be correlated correctly.

## Methods

Methods are UTF-8 strings.

Examples:

```txt
user.get
system.ping
math.add
```

## Payloads

Argus v1 uses JSON payload serialization.

Examples:

```json
{
  "id": 1
}
```

Custom binary serialization is intentionally excluded from v1.

## Error Model

Errors are transmitted as structured payloads.

Example:

```json
{
  "code": "ARGUS_METHOD_NOT_FOUND",
  "message": "Method not found"
}
```

## Future Expansion

Possible future protocol extensions:

* Streaming
* Pub/Sub
* Service discovery
* Binary serializers
* Compression
* Load balancing
* Circuit breakers
