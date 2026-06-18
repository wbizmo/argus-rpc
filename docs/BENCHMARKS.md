# Benchmarks

Argus includes a local benchmark suite that compares:

* Argus TCP binary RPC
* Node HTTP JSON

The goal is not to claim universal superiority over HTTP or established RPC systems. The benchmark exists to support learning, experimentation, and infrastructure research.

Performance depends on machine resources, Node.js version, CPU load, operating system, networking conditions, and runtime configuration.

## Running Benchmarks

```bash
npm run bench
```

You can customize request count and concurrency:

```bash
ARGUS_BENCH_REQUESTS=5000 ARGUS_BENCH_CONCURRENCY=100 npm run bench
```

## Metrics

The benchmark reports:

* Total requests
* Completed requests
* Failed requests
* Total duration
* Average latency
* P95 latency
* Requests per second

## What Is Being Compared?

### Argus TCP Binary RPC

Argus uses:

* A raw TCP connection
* Explicit binary framing
* Message IDs
* Request/response correlation
* JSON payload serialization for v1

### Node HTTP JSON

The HTTP baseline uses:

* Node's built-in HTTP server
* POST requests
* JSON request body
* JSON response body

## Why JSON Still Exists in v1

Argus v1 intentionally does not implement a custom binary serializer.

The benchmark focuses on transport and framing behavior rather than serialization design.

Custom binary serialization is intentionally reserved for future versions.

## Example Output

```txt
Argus Benchmark Suite
=====================
Requests: 1000
Concurrency: 50

Argus TCP binary RPC
--------------------
Total requests:      1000
Completed requests:  1000
Failed requests:     0
Total duration:      120.00ms
Average latency:     4.500ms
P95 latency:         9.200ms
Requests/second:     8333.33

Node HTTP JSON
--------------
Total requests:      1000
Completed requests:  1000
Failed requests:     0
Total duration:      300.00ms
Average latency:     12.300ms
P95 latency:         28.000ms
Requests/second:     3333.33
```

The numbers above are examples only. Real results should be generated locally.

## Interpreting Results

Argus may perform well in local benchmarks because it avoids parts of the HTTP request lifecycle and uses persistent TCP communication.

However, this does not mean Argus should replace HTTP or gRPC.

Argus is a protocol engineering project designed to demonstrate:

* Framing
* Request correlation
* TCP lifecycle management
* Heartbeats
* Retry behavior
* Pooling
* Failure detection
* Benchmark methodology

## Research Notes

Benchmarks should be interpreted as local measurements, not universal claims.

For serious performance analysis, results should be collected across:

* Multiple request counts
* Multiple concurrency levels
* Multiple Node.js versions
* Multiple machines
* Warm and cold runs
* CPU and memory profiles
