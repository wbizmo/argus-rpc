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

  it("supports multiple sequential calls", async () => {
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
});
