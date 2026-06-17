# Roadmap

## Sprint 0 — Repository Foundation

Repository setup, TypeScript configuration, testing configuration, documentation scaffold, custom license, and CI setup.

## Sprint 1 — Binary Framing Core

Build the binary frame specification and protocol layer.

Deliverables:

* Frame types
* Encoder
* Decoder
* Protocol constants
* Frame validation

## Sprint 2 — TCP Client & Server

Build request/response communication over raw TCP.

Deliverables:

* TCP server
* TCP client
* Method registry
* Message IDs
* Request correlation

## Sprint 3 — Errors, Timeouts & Heartbeats

Introduce reliability behavior.

Deliverables:

* Structured errors
* Timeout handling
* Heartbeat system
* Connection cleanup

## Sprint 4 — Retry & Connection Pool

Introduce resilience features.

Deliverables:

* Retry logic
* Exponential backoff
* Connection pooling
* Health checks
* Socket cleanup

## Sprint 5 — Benchmarks

Measure protocol behavior against a traditional HTTP JSON baseline.

Metrics:

* Average latency
* P95 latency
* Requests per second
* Success rate
* Failure rate

## Sprint 6 — Testing & Failure Modes

Expand protocol verification.

Deliverables:

* Unit tests
* Integration tests
* Failure-mode tests
* Benchmark validation tests

## Sprint 7 — Documentation & License

Finalize project documentation and release materials.

Deliverables:

* Protocol documentation
* Architecture documentation
* Benchmark documentation
* Failure-mode documentation
* Argus Source License

## Sprint 8 — v1.0.0 Release

Release the first stable version of Argus.

Deliverables:

* Final build
* Final test run
* Release tag
* GitHub release

## Future v2 Ideas

The following features are intentionally excluded from v1:

* Streaming
* Pub/Sub
* Service discovery
* Load balancing
* Circuit breaker
* Custom binary serializer
* Dashboard

These may be explored in future versions as the project evolves.
