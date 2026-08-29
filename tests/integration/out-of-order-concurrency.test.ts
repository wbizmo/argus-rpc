import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusServer } from "../../src";

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe("multiplexed request execution", () => {
  const servers: ArgusServer[] = [];
  const clients: ArgusClient[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("allows async handlers to complete out of request order while preserving correlation", async () => {
    const completed: number[] = [];
    const server = new ArgusServer({ maxConcurrentCalls: 3 });
    servers.push(server);

    server.method("work", async (payload) => {
      const input = payload as { value: number; delayMs: number };
      await delay(input.delayMs);
      completed.push(input.value);
      return { value: input.value };
    });

    const port = await server.listen();
    const client = new ArgusClient({ port });
    clients.push(client);

    const responses = await Promise.all([
      client.call<{ value: number }>("work", { value: 1, delayMs: 70 }),
      client.call<{ value: number }>("work", { value: 2, delayMs: 5 }),
      client.call<{ value: number }>("work", { value: 3, delayMs: 30 })
    ]);

    expect(responses.map((response) => response.value)).toEqual([1, 2, 3]);
    expect(completed).toEqual([2, 3, 1]);
  });

  it("never executes more than the configured number of handlers at once", async () => {
    let active = 0;
    let observedMax = 0;
    const server = new ArgusServer({ maxConcurrentCalls: 2, maxQueuedCalls: 20 });
    servers.push(server);

    server.method("bounded", async () => {
      active += 1;
      observedMax = Math.max(observedMax, active);
      await delay(15);
      active -= 1;
      return true;
    });

    const port = await server.listen();
    const client = new ArgusClient({ port });
    clients.push(client);

    await Promise.all(Array.from({ length: 10 }, () => client.call("bounded")));
    expect(observedMax).toBe(2);
  });
});
