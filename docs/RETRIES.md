# Retries

Argus includes optional retry behavior for client requests.

Retries help recover from temporary failures while avoiding infinite request loops.

## Why Retries Exist

Distributed systems fail for many reasons:

* Temporary network interruption
* Short service outage
* Connection reset
* Resource contention
* Slow startup behavior

Some failures are temporary and may succeed when attempted again.

## Basic Usage

```ts
const client = new ArgusClient({
  port: 7000,
  retry: {
    retries: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000
  }
});
```

## Retry Lifecycle

Argus performs:

```txt
Attempt 1
↓
Failure
↓
Wait
↓
Attempt 2
↓
Failure
↓
Wait
↓
Attempt 3
```

If all attempts fail, the final error is returned.

## Exponential Backoff

Argus uses exponential backoff.

Example:

```txt
Attempt 1 -> 100ms
Attempt 2 -> 200ms
Attempt 3 -> 400ms
Attempt 4 -> 800ms
```

The delay is capped by `maxDelayMs`.

## Conditional Retry

Retries can be controlled using:

```ts
shouldRetry(error, attempt)
```

Example:

```ts
shouldRetry(error) {
  return error.code === "ARGUS_CONNECTION_CLOSED";
}
```

## Design Philosophy

Retries should reduce temporary failures.

Retries should never hide permanent failures.

Argus always surfaces the final error if recovery is unsuccessful.
