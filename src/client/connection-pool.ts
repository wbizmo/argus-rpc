import { ArgusClient, type ArgusClientOptions } from "./ArgusClient";

export interface ConnectionPoolOptions extends ArgusClientOptions {
  size?: number;
}

interface PooledConnection {
  client: ArgusClient;
  inUse: boolean;
  healthy: boolean;
}

export class ArgusConnectionPool {
  private readonly size: number;
  private readonly clientOptions: ArgusClientOptions;
  private readonly connections: PooledConnection[] = [];
  private cursor = 0;

  constructor(options: ConnectionPoolOptions) {
    this.size = options.size ?? 4;
    this.clientOptions = {
      host: options.host,
      port: options.port,
      timeoutMs: options.timeoutMs
    };

    if (!Number.isInteger(this.size) || this.size < 1) {
      throw new Error("ARGUS_INVALID_POOL_SIZE");
    }
  }

  async call<TResponse = unknown>(
    method: string,
    payload?: unknown,
    timeoutMs?: number
  ): Promise<TResponse> {
    const connection = await this.acquire();

    try {
      const response = await connection.client.call<TResponse>(method, payload, timeoutMs);
      connection.healthy = true;
      return response;
    } catch (error) {
      connection.healthy = false;
      await connection.client.close();
      throw error;
    } finally {
      connection.inUse = false;
    }
  }

  async ping(): Promise<boolean> {
    const connection = await this.acquire();

    try {
      const result = await connection.client.ping();
      connection.healthy = true;
      return result;
    } catch (error) {
      connection.healthy = false;
      await connection.client.close();
      throw error;
    } finally {
      connection.inUse = false;
    }
  }

  async close(): Promise<void> {
    await Promise.all(
      this.connections.map(async (connection) => {
        await connection.client.close();
      })
    );

    this.connections.length = 0;
    this.cursor = 0;
  }

  stats(): {
    size: number;
    created: number;
    available: number;
    inUse: number;
    unhealthy: number;
  } {
    return {
      size: this.size,
      created: this.connections.length,
      available: this.connections.filter((connection) => !connection.inUse && connection.healthy).length,
      inUse: this.connections.filter((connection) => connection.inUse).length,
      unhealthy: this.connections.filter((connection) => !connection.healthy).length
    };
  }

  private async acquire(): Promise<PooledConnection> {
    const reusable = this.findReusableConnection();

    if (reusable) {
      reusable.inUse = true;
      return reusable;
    }

    if (this.connections.length < this.size) {
      const created = this.createConnection();
      created.inUse = true;
      this.connections.push(created);
      await created.client.connect();
      return created;
    }

    throw new Error("ARGUS_POOL_EXHAUSTED");
  }

  private createConnection(): PooledConnection {
    return {
      client: new ArgusClient(this.clientOptions),
      inUse: false,
      healthy: true
    };
  }

  private findReusableConnection(): PooledConnection | null {
    if (this.connections.length === 0) {
      return null;
    }

    for (let index = 0; index < this.connections.length; index += 1) {
      const position = (this.cursor + index) % this.connections.length;
      const connection = this.connections[position];

      if (connection && !connection.inUse && connection.healthy) {
        this.cursor = (position + 1) % this.connections.length;
        return connection;
      }
    }

    return null;
  }
}
