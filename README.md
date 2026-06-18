# Argus RPC

A lightweight TypeScript-native RPC protocol built for learning, experimentation, benchmarking, and infrastructure research.

Argus is a binary framed request/response protocol that runs directly over raw TCP and explores core distributed-systems concepts including framing, request correlation, heartbeats, retries, connection pooling, timeout management, and failure detection.

---

## Why Argus?

Modern applications often communicate through HTTP, JSON APIs, message queues, or established RPC systems such as gRPC.

Argus does not attempt to replace those technologies.

Instead, Argus exists as an educational and engineering-focused project that explores how an RPC protocol can be built from first principles.

The project demonstrates:

* Binary framing
* TCP communication
* Request/response correlation
* Structured error handling
* Heartbeats
* Retry behavior
* Connection pooling
* Failure detection
* Protocol testing
* Benchmark design

---

## Why "Argus"?

Argus is named after Argus Panoptes from Greek mythology, the many-eyed guardian known for constant vigilance.

The protocol was designed around observability, reliability, and awareness of network state.

Through heartbeats, connection management, request tracking, retries, and failure detection, Argus continuously monitors the health of communication between distributed services.

While Argus is a technical system and not a mythological representation, the name reflects the project's goal:

> A protocol that is always watching, always aware, and always ready to detect failure before it becomes disruption.

---

## Features

### Protocol

* Binary frame protocol
* Versioned frame format
* Message IDs
* Request/response correlation
* Structured error frames
* UTF-8 method names
* JSON payload serialization

### Networking

* Raw TCP server
* Raw TCP client
* Method registry
* Concurrent request handling
* Connection tracking

### Reliability

* Request timeouts
* Heartbeats (PING/PONG)
* Retry support
* Exponential backoff
* Connection cleanup
* Connection pooling
* Failure-mode testing

### Engineering

* TypeScript
* Vitest test suite
* Benchmark suite
* GitHub Actions CI
* Architecture documentation
* Protocol documentation

---

## Installation

```bash
npm install
```

---

## Build

```bash
npm run build
```

---

## Test

```bash
npm test
```

---

## Benchmark

```bash
npm run bench
```

---

## Quick Example

### Server

```ts
import { ArgusServer } from "argus-rpc";

const server = new ArgusServer();

server.method("user.get", async (payload) => {
  return {
    id: payload.id,
    name: "Williams"
  };
});

await server.listen(7000);
```

### Client

```ts
import { ArgusClient } from "argus-rpc";

const client = new ArgusClient({
  host: "127.0.0.1",
  port: 7000
});

const user = await client.call("user.get", {
  id: 1
});

console.log(user);
```

---

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

Fixed header:

```txt
14 bytes
```

---

## Message Types

```txt
REQUEST
RESPONSE
ERROR
PING
PONG
```

---

## Reliability Model

Argus includes:

* Request tracking
* Message correlation
* Timeout handling
* Structured errors
* Heartbeat verification
* Retry behavior
* Connection reuse
* Failure detection

The project intentionally treats failure handling as a first-class protocol concern.

---

## Architecture

```txt
Client
  │
  ▼
Frame Encoder
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

More details are available in:

* docs/ARCHITECTURE.md
* docs/PROTOCOL.md
* docs/FAILURE_MODES.md
* docs/HEARTBEATS.md
* docs/CONNECTION_POOL.md
* docs/RETRIES.md
* docs/BENCHMARKS.md

---

## Testing

Argus includes:

* Unit tests
* Integration tests
* Failure-mode tests
* Benchmark validation

The goal is to verify both correctness and reliability behavior.

---

## Benchmark Philosophy

Benchmark results are intended for experimentation and learning.

They should not be interpreted as universal performance claims.

Performance depends on:

* Hardware
* Runtime configuration
* Operating system
* Node.js version
* Network conditions

---

## Current Scope

### Included in v1

* Binary framing
* TCP server
* TCP client
* Request/response RPC
* Method registry
* Message IDs
* Structured errors
* Timeouts
* Heartbeats
* Retries
* Connection pooling
* Benchmarks
* CI
* Documentation

### Deferred

* Streaming
* Pub/Sub
* Service discovery
* Load balancing
* Circuit breakers
* Custom binary serializers
* Dashboard

---

## License

Argus Source License

See LICENSE for details.

---

## Author

Built by Williams Ashibuogwu (wbizmo)

GitHub:

github.com/wbizmo
