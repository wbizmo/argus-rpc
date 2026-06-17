# Argus RPC

Argus is a lightweight TypeScript-native RPC protocol over raw TCP built for learning, experimentation, benchmarking, and infrastructure research.

It is not intended to replace gRPC, HTTP, or established RPC frameworks. Argus exists to explore how binary framing, request correlation, heartbeats, retries, connection pooling, and failure handling work beneath higher-level application frameworks.

## Why "Argus"?

Argus is named after Argus Panoptes from Greek mythology, the many-eyed guardian known for constant vigilance.

The protocol was designed around observability, reliability, and awareness of network state. Through heartbeats, connection management, request tracking, retries, and failure detection, Argus continuously monitors the health of communication between distributed services.

While Argus is a technical system and not a mythological representation, the name reflects the project's goal: a protocol that is always watching, always aware, and always ready to detect failure before it becomes disruption.

## Project Philosophy

Argus is built around four core principles:

* Observability
* Reliability
* Awareness
* Resilience

Every request should be traceable.

Every connection should be observable.

Every failure should become visible.

Every dead peer should eventually be detected.

## v1 Scope

Argus v1 focuses on:

* Binary framing
* TCP server
* TCP client
* Request/response RPC calls
* Method registry
* Message IDs
* Structured errors
* Timeouts
* Heartbeats
* Connection cleanup
* Basic retry logic
* Connection pool
* Benchmark scripts
* Full test suite
* Protocol-grade documentation
* GitHub Actions CI

## Not v1

The following are intentionally excluded from v1:

* Streaming
* Pub/Sub
* Service discovery
* Load balancing
* Circuit breaker
* Custom binary serializer
* Dashboard

These may be explored in future versions.

## Scripts

```bash
npm test
npm run build
npm run bench
```

## Documentation

| Document             | Purpose                         |
| -------------------- | ------------------------------- |
| docs/INTRODUCTION.md | Project purpose and positioning |
| docs/PROTOCOL.md     | Binary frame specification      |
| docs/ARCHITECTURE.md | Internal system architecture    |
| docs/TESTING.md      | Testing strategy                |
| docs/ROADMAP.md      | Sprint roadmap and future plans |
| docs/CHANGELOG.md    | Release history                 |

## Status

Current Version:

```txt
0.0.0
```

Development Phase:

```txt
Sprint 0 — Repository Foundation
```

## Author

Built by Williams Ashibuogwu (wbizmo)

GitHub: github.com/wbizmo

## License

Argus is distributed under the Argus Source License.
