# Connection Pool

Argus includes a lightweight TCP connection pool for reusing client connections.

The pool is designed for experimentation, benchmarking, and infrastructure learning.

## Purpose

Creating a new TCP connection for every request adds overhead.

A connection pool allows multiple calls to reuse existing TCP clients.

## Responsibilities

The pool is responsible for:

* Creating clients lazily
* Reusing healthy clients
* Tracking in-use connections
* Closing unhealthy clients
* Reporting pool stats
* Enforcing pool size limits

## Basic Usage

```ts
import { ArgusConnectionPool } from "argus-rpc";

const pool = new ArgusConnectionPool({
  host: "127.0.0.1",
  port: 7000,
  size: 4
});

const response = await pool.call("system.ping");

await pool.close();
```

## Pool Stats

The pool exposes:

```ts
pool.stats()
```

Example result:

```ts
{
  size: 4,
  created: 1,
  available: 1,
  inUse: 0,
  unhealthy: 0
}
```

## Health Behavior

When a pooled call succeeds, the connection is considered healthy.

When a pooled call fails, the pool marks the connection unhealthy and closes it.

Unhealthy connections are not reused.

## Pool Exhaustion

If all connections are in use and the pool cannot create another connection, it throws:

```txt
ARGUS_POOL_EXHAUSTED
```

## Design Scope

The v1 pool is intentionally simple.

It does not implement:

* Queueing
* Priority scheduling
* Circuit breaking
* Load balancing
* Service discovery

Those are intentionally reserved for future versions.
