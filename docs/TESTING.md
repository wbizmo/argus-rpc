# Testing

Argus v1 uses Vitest for unit, integration, and failure-mode testing.

The goal is not merely to verify functionality but to demonstrate protocol correctness, reliability behavior, and failure handling.

## Test Categories

```txt
tests/
├── unit/
├── integration/
└── benchmark/
```

## Unit Tests

Unit tests validate individual protocol components in isolation.

Coverage includes:

* Frame encoding
* Frame decoding
* Message ID generation
* Message type validation
* Structured error handling
* Retry utility behavior
* Connection pool behavior

## Integration Tests

Integration tests run a real Argus server and a real Argus client communicating over TCP.

Coverage includes:

* Client/server connection
* Request/response lifecycle
* Method execution
* Concurrent requests
* Response correlation
* Multiple client connections

## Failure-Mode Tests

Failure-mode testing is a core part of the project.

Coverage includes:

* Unknown methods
* Invalid frames
* Corrupted payloads
* Request timeouts
* Dead connections
* Retry exhaustion
* Pool exhaustion

## Heartbeat Tests

Heartbeat tests verify:

* PING frame generation
* PONG responses
* Dead peer detection
* Automatic cleanup of inactive connections

## Benchmark Validation

Benchmark validation ensures benchmark scripts execute correctly and produce valid measurements.

## Continuous Integration

GitHub Actions automatically runs:

```bash
npm test
npm run build
```

on pushes and pull requests to maintain repository health.

## Success Criteria

Argus v1 is considered complete when:

* All tests pass
* Integration tests pass
* Failure-mode tests pass
* Benchmarks execute successfully
* CI passes consistently
