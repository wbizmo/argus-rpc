# Protocol Specification

Argus uses a compact binary frame format over raw TCP.

Version 1 focuses on explicit framing, request correlation, structured errors, and connection awareness.

## Frame Layout

```txt
+------------------+
| MAGIC      2 B   |
+------------------+
| VERSION    1 B   |
+------------------+
| TYPE       1 B   |
+------------------+
| MESSAGE ID 4 B   |
+------------------+
| METHOD LEN 2 B   |
+------------------+
| PAYLOAD LEN 4 B  |
+------------------+
| METHOD           |
+------------------+
| PAYLOAD          |
+------------------+
```

## Fields

| Field       | Size     | Description                |
| ----------- | -------- | -------------------------- |
| MAGIC       | 2 bytes  | Protocol identifier (`AR`) |
| VERSION     | 1 byte   | Protocol version           |
| TYPE        | 1 byte   | Frame type                 |
| MESSAGE_ID  | 4 bytes  | Request correlation ID     |
| METHOD_LEN  | 2 bytes  | Method name length         |
| PAYLOAD_LEN | 4 bytes  | Payload length             |
| METHOD      | Variable | UTF-8 method name          |
| PAYLOAD     | Variable | Serialized payload         |

## Message Types

Argus v1 supports:

* REQUEST
* RESPONSE
* ERROR
* PING
* PONG

## Design Goals

* Simple to inspect
* Easy to benchmark
* Explicit request correlation
* Predictable failure behavior
* Protocol transparency

Argus intentionally avoids introducing a custom serializer in v1 so that protocol behavior remains the primary focus.
