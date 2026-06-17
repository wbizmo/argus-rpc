import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusServer } from "../../src";

describe("Argus request/response integration", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
    await client?.close();
    await server?.close();

    client = null;
    server = null;
  });

  it("calls a registered server method over TCP", async () => {
    server = new ArgusServer();

    server.method("user.get", async (payload) => {
      const input = payload as { id: number };

      return {
        id: input.id,
        name: "Williams"
      };
    });

    const port = await server.listen();
    client = new ArgusClient({ port });

    const response = await client.call<{ id: number; name: string }>("user.get", {
      id: 1
    });

    expect(response).toEqual({
      id: 1,
      name: "Williams"
    });
  });

  it("returns a structured error for unknown methods", async () => {
    server = new ArgusServer();
    const port = await server.listen();
    client = new ArgusClient({ port });

    await expect(client.call("missing.method", {})).rejects.toThrow("ARGUS_METHOD_NOT_FOUND");
  });

  it("supports multiple sequential calls over the same connection", async () => {
    server = new ArgusServer();

    server.method("math.double", async (payload) => {
      const input = payload as { value: number };
      return { value: input.value * 2 };
    });

    const port = await server.listen();
    client = new ArgusClient({ port });

    await expect(client.call("math.double", { value: 2 })).resolves.toEqual({ value: 4 });
    await expect(client.call("math.double", { value: 5 })).resolves.toEqual({ value: 10 });
    await expect(client.call("math.double", { value: 9 })).resolves.toEqual({ value: 18 });
  });

  it("supports concurrent calls and correlates responses by message ID", async () => {
    server = new ArgusServer();

    server.method("math.square", async (payload) => {
      const input = payload as { value: number };

      return {
        value: input.value * input.value
      };
    });

    const port = await server.listen();
    client = new ArgusClient({ port });

    const responses = await Promise.all([
      client.call("math.square", { value: 2 }),
      client.call("math.square", { value: 3 }),
      client.call("math.square", { value: 4 }),
      client.call("math.square", { value: 5 })
    ]);

    expect(responses).toEqual([
      { value: 4 },
      { value: 9 },
      { value: 16 },
      { value: 25 }
    ]);
  });

  it("supports multiple clients connected to one server", async () => {
    server = new ArgusServer();

    server.method("identity.echo", async (payload) => {
      return payload;
    });

    const port = await server.listen();

    const firstClient = new ArgusClient({ port });
    const secondClient = new ArgusClient({ port });

    try {
      await expect(firstClient.call("identity.echo", { client: "one" })).resolves.toEqual({
        client: "one"
      });

      await expect(secondClient.call("identity.echo", { client: "two" })).resolves.toEqual({
        client: "two"
      });
    } finally {
      await firstClient.close();
      await secondClient.close();
    }
  });

  it("exposes registered method names", () => {
    server = new ArgusServer();

    server.method("system.ping", async () => ({ ok: true }));
    server.method("user.get", async () => ({ id: 1 }));

    expect(server.methods()).toEqual(["system.ping", "user.get"]);
  });
});
