import { afterEach, describe, expect, it } from "vitest";
import {
  ArgusClient,
  ArgusError,
  ArgusServer,
  ArgusStatus,
  type ArgusServerInterceptor
} from "../../src";

describe("server interceptors", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
    await client?.close();
    await server?.close();
    client = null;
    server = null;
  });

  it("runs middleware in deterministic nesting order", async () => {
    const events: string[] = [];
    const first: ArgusServerInterceptor = async (payload, context, next) => {
      events.push("first:before");
      const result = await next(payload, context);
      events.push("first:after");
      return result;
    };
    const second: ArgusServerInterceptor = async (payload, context, next) => {
      events.push("second:before");
      const result = await next(payload, context);
      events.push("second:after");
      return result;
    };

    server = new ArgusServer({ interceptors: [first, second] });
    server.method("echo", async (payload) => {
      events.push("handler");
      return payload;
    });
    const port = await server.listen();
    client = new ArgusClient({ port });

    await client.call("echo", { ok: true });
    expect(events).toEqual([
      "first:before",
      "second:before",
      "handler",
      "second:after",
      "first:after"
    ]);
  });

  it("supports authentication policy without coupling it to handlers", async () => {
    const auth: ArgusServerInterceptor = async (payload, context, next) => {
      if (context.metadata.authorization !== "Bearer test") {
        throw new ArgusError({
          code: "ARGUS_UNAUTHENTICATED",
          message: "missing credentials",
          status: ArgusStatus.UNAUTHENTICATED
        });
      }
      return next(payload, context);
    };

    server = new ArgusServer({ interceptors: [auth] });
    server.method("private", async () => ({ ok: true }));
    const port = await server.listen();
    client = new ArgusClient({ port });

    await expect(client.call("private")).rejects.toMatchObject({
      status: ArgusStatus.UNAUTHENTICATED
    });
    await expect(client.callWithOptions("private", {}, {
      metadata: { authorization: "Bearer test" }
    })).resolves.toEqual({ ok: true });
  });
});
