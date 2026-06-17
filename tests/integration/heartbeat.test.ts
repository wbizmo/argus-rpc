import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusServer } from "../../src";

describe("Argus heartbeat integration", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
    await client?.close();
    await server?.close();

    client = null;
    server = null;
  });

  it("responds to ping with pong", async () => {
    server = new ArgusServer();
    const port = await server.listen();

    client = new ArgusClient({ port });

    await expect(client.ping()).resolves.toBe(true);
  });
});
