# Observability

Argus v2 treats observability as a protocol-runtime concern rather than something applications must reconstruct from logs.

Each `ArgusServer` owns an `ArgusMetrics` collector by default, or accepts a caller-provided collector through `metrics`. `server.metricsSnapshot()` returns bounded cumulative counters, gauges, and fixed-bucket histograms without retaining individual request samples.

## Core server signals

Current instrumentation includes:

- `connections.opened`, `connections.closed`, `connections.active`
- `rpc.calls.started`, `rpc.calls.completed`, `rpc.calls.failed`
- `rpc.calls.active`, `rpc.calls.queued`
- `rpc.cancellations.received`, `rpc.duplicate_message_ids`
- status-specific failure counters such as `rpc.status.deadline_exceeded`
- `rpc.server.duration_ms` histogram
- `transport.frames.received`, `transport.frames.sent`, `transport.frames.invalid`
- `transport.bytes.received`, `transport.bytes.sent`
- `keepalive.pings.received`

The default latency histogram uses fixed cumulative millisecond buckets so memory usage does not grow with traffic volume.

## Exporting metrics

The core package deliberately does not require a metrics backend. Applications can periodically read `metricsSnapshot()` and adapt it to Prometheus, OpenTelemetry metrics, StatsD, a custom telemetry pipeline, or an internal dashboard.

Argus metadata can carry tracing headers such as `traceparent`, while server interceptors provide the integration point for starting and ending tracing spans. A dedicated OpenTelemetry adapter can therefore remain optional instead of making the protocol runtime depend on the OpenTelemetry SDK.

## Cardinality discipline

Core metric names do not include message IDs, peer addresses, request IDs, or arbitrary metadata. Method-level or tenant-level labels should be added by an application exporter only when its cardinality budget is understood.
