import { ArgusError } from "../errors";
import { ArgusStatus } from "../rpc";
import { ArgusClient, type ArgusClientOptions } from "./ArgusClient";
import { CircuitBreaker, type CircuitBreakerOptions } from "./circuit-breaker";

export interface ConnectionPoolOptions extends ArgusClientOptions {
  size?: number;
  maxConcurrentPerConnection?: number;
  acquireTimeoutMs?: number;
  circuitBreaker?: false | CircuitBreakerOptions;
}

interface PooledConnection {
  id: number;
  client: ArgusClient;
  inFlight: number;
  healthy: boolean;
}

interface CapacityWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class ArgusConnectionPool {
  private readonly size: number;
  private readonly maxConcurrentPerConnection: number;
  private readonly acquireTimeoutMs: number;
  private readonly clientOptions: ArgusClientOptions;
  private readonly breaker: CircuitBreaker | null;
  private readonly connections: PooledConnection[] = [];
  private readonly waiters: CapacityWaiter[] = [];
  private nextConnectionId = 1;
  private closed = false;

  constructor(options: ConnectionPoolOptions) {
    this.size = options.size ?? 4;
    this.maxConcurrentPerConnection = options.maxConcurrentPerConnection ?? 128;
    this.acquireTimeoutMs = options.acquireTimeoutMs ?? options.timeoutMs ?? 3000;
    const {
      size: _size,
      maxConcurrentPerConnection: _maxConcurrent,
      acquireTimeoutMs: _acquireTimeout,
      circuitBreaker,
      ...clientOptions
    } = options;
    this.clientOptions = clientOptions;
    this.breaker = circuitBreaker === false
      ? null
      : new CircuitBreaker(circuitBreaker ?? {});

    if (!Number.isInteger(this.size) || this.size < 1) {
      throw new Error("ARGUS_INVALID_POOL_SIZE");
    }
    if (!Number.isInteger(this.maxConcurrentPerConnection) || this.maxConcurrentPerConnection < 1) {
      throw new Error("ARGUS_INVALID_POOL_CONCURRENCY");
    }
  }

  async call<TResponse = unknown>(
    method: string,
    payload?: unknown,
    timeoutMs?: number
  ): Promise<TResponse> {
    const operation = async (): Promise<TResponse> => {
      const connection = await this.acquire();
      try {
        const response = await connection.client.call<TResponse>(method, payload, timeoutMs);
        connection.healthy = true;
        return response;
      } catch (error) {
        if (isTransportFailure(error)) await this.retire(connection);
        throw error;
      } finally {
        this.release(connection);
      }
    };

    return this.breaker ? this.breaker.execute(operation) : operation();
  }

  async ping(): Promise<boolean> {
    const connection = await this.acquire();
    try {
      const result = await connection.client.ping();
      connection.healthy = true;
      return result;
    } catch (error) {
      if (isTransportFailure(error)) await this.retire(connection);
      throw error;
    } finally {
      this.release(connection);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    const closeError = new ArgusError({
      code: "ARGUS_POOL_CLOSED",
      message: "Argus connection pool closed",
      status: ArgusStatus.UNAVAILABLE
    });
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(closeError);
    }

    const connections = this.connections.splice(0);
    await Promise.all(connections.map((connection) => connection.client.close()));
  }

  stats(): {
    size: number;
    created: number;
    available: number;
    inUse: number;
    unhealthy: number;
    totalInFlight: number;
    waiters: number;
  } {
    return {
      size: this.size,
      created: this.connections.length,
      available: this.connections.filter((connection) =>
        connection.healthy && connection.inFlight < this.maxConcurrentPerConnection
      ).length,
      inUse: this.connections.filter((connection) => connection.inFlight > 0).length,
      unhealthy: this.connections.filter((connection) => !connection.healthy).length,
      totalInFlight: this.connections.reduce((sum, connection) => sum + connection.inFlight, 0),
      waiters: this.waiters.length
    };
  }

  private async acquire(): Promise<PooledConnection> {
    if (this.closed) {
      throw new ArgusError({
        code: "ARGUS_POOL_CLOSED",
        message: "Argus connection pool is closed",
        status: ArgusStatus.UNAVAILABLE
      });
    }

    while (true) {
      const reusable = this.findLeastLoadedConnection();
      if (reusable) {
        reusable.inFlight += 1;
        return reusable;
      }

      if (this.connections.length < this.size) {
        return this.createConnection();
      }

      await this.waitForCapacity();
    }
  }

  private async createConnection(): Promise<PooledConnection> {
    const connection: PooledConnection = {
      id: this.nextConnectionId++,
      client: new ArgusClient(this.clientOptions),
      inFlight: 1,
      healthy: true
    };
    this.connections.push(connection);

    try {
      await connection.client.connect();
      return connection;
    } catch (error) {
      connection.healthy = false;
      this.remove(connection);
      await connection.client.close().catch(() => undefined);
      this.notifyCapacity();
      throw error;
    }
  }

  private findLeastLoadedConnection(): PooledConnection | null {
    let selected: PooledConnection | null = null;

    for (const connection of this.connections) {
      if (!connection.healthy || connection.inFlight >= this.maxConcurrentPerConnection) continue;
      if (!selected || connection.inFlight < selected.inFlight) selected = connection;
    }
    return selected;
  }

  private async retire(connection: PooledConnection): Promise<void> {
    if (!connection.healthy) return;
    connection.healthy = false;
    this.remove(connection);
    await connection.client.close().catch(() => undefined);
    this.notifyCapacity();
  }

  private release(connection: PooledConnection): void {
    connection.inFlight = Math.max(0, connection.inFlight - 1);
    this.notifyCapacity();
  }

  private remove(connection: PooledConnection): void {
    const index = this.connections.indexOf(connection);
    if (index >= 0) this.connections.splice(index, 1);
  }

  private waitForCapacity(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const waiter: CapacityWaiter = {
        resolve: () => {
          clearTimeout(waiter.timer);
          resolve();
        },
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new ArgusError({
            code: "ARGUS_POOL_ACQUIRE_TIMEOUT",
            message: `Timed out waiting ${this.acquireTimeoutMs}ms for pool capacity`,
            status: ArgusStatus.RESOURCE_EXHAUSTED
          }));
        }, this.acquireTimeoutMs)
      };
      this.waiters.push(waiter);
    });
  }

  private notifyCapacity(): void {
    const waiter = this.waiters.shift();
    waiter?.resolve();
  }
}

function isTransportFailure(error: unknown): boolean {
  return error instanceof ArgusError && error.status === ArgusStatus.UNAVAILABLE;
}
