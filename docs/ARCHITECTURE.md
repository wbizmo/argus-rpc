# Architecture

Argus is intentionally small.

The project exists to explore protocol design, transport behavior, and reliability concepts.

## High-Level Flow

```txt
Client
  │
  ▼
Argus Frame Encoder
  │
  ▼
TCP Socket
  │
  ▼
Argus Server
  │
  ▼
Method Registry
  │
  ▼
Handler
  │
  ▼
Response Frame
  │
  ▼
Client
```

## Core Components

### Protocol Layer

Location:

```txt
src/protocol
```

Responsibilities:

* Frame creation
* Frame encoding
* Frame decoding
* Message parsing
* Protocol validation

## Server Layer

Location:

```txt
src/server
```

Responsibilities:

* TCP server lifecycle
* Request processing
* Method execution
* Error responses
* Heartbeat responses

## Client Layer

Location:

```txt
src/client
```

Responsibilities:

* TCP connectivity
* Request tracking
* Response correlation
* Timeout management
* Retry behavior

## Error Layer

Location:

```txt
src/errors
```

Responsibilities:

* Structured error model
* Protocol-safe error transport

## Connection Layer

Location:

```txt
src/connection
```

Responsibilities:

* Heartbeats
* Connection tracking
* Connection cleanup

## Testing Strategy

Argus uses:

```txt
Unit Tests
Integration Tests
Failure-Mode Tests
Benchmark Validation
```

The goal is to verify both correctness and reliability behavior.

## Why "Argus"?

Argus is named after Argus Panoptes, the many-eyed guardian associated with vigilance.

The protocol emphasizes:

* Awareness of connection state
* Request tracking
* Failure detection
* Heartbeats
* Observability

The name reflects a protocol designed to keep watch over communication between services.

## Author

Williams Ashibuogwu (wbizmo)

GitHub:

github.com/wbizmo
