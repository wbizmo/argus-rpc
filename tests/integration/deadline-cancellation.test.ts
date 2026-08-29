import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusServer, ArgusStatus } from "../../src";

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe("deadlines and cancellation", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
    await client?.close();
    await server?.close();
    client = null;
    server = null;
  });

  it("propagates a client deadline to the active server handler", async () => {
    let serverObservedAbort = false;
    server = new ArgusServer();
    server.method("slow", async (_payload, context) => {
      await new Promise<void>((resolve) => {
        if (context?.signal.aborted) {
          serverObservedAbort = true;
          resolve();
          return;
        }
        context?.signal.addEventListener("abort", () => {
          serverObservedAbort = true;
          resolve();
        }, { once: true });
      });
      return { late: true };
    });

    const port = await server.listen();
    client = new ArgusClient({ port });

    await expect(client.call("slow", {}, 25)).rejects.toMatchObject({
      status: ArgusStatus.DEADLINE_EXCEEDED
    });
    await delay(20);
    expect(serverObservedAbort).toBe(true);
  });

  it("propagates AbortSignal cancellation and settles the call only once", async () => {
    let serverObservedAbort = false;
    server = new ArgusServer();
    server.method("cancel.me", async (_payload, context) => {
      await new Promise<void>((resolve) => {
        context?.signal.addEventListener("abort", () => {
          serverObservedAbort = true;
          resolve();
        }, { once: true });
      });
      return { shouldBeIgnored: true };
    });

    const port = await server.listen();
    client = new ArgusClient({ port });
    const controller = new AbortController();
    const call = client.callWithOptions("cancel.me", {}, {
      timeoutMs: 1000,
      signal: controller.signal
    });

    await delay(10);
    controller.abort("test cancellation");

    await expect(call).rejects.toMatchObject({ status: ArgusStatus.CANCELLED });
    await delay(20);
    expect(serverObservedAbort).toBe(true);
  });

  it("delivers normalized metadata through call context", async () => {
    server = new ArgusServer();
    server.method("metadata", async (_payload, context) => context?.metadata);

    const port = await server.listen();
    client = new ArgusClient({ port });

    await expect(client.callWithOptions("metadata", {}, {
      metadata: { "X-Request-ID": "abc-123" }
    })).resolves.toEqual({ "x-request-id": "abc-123" });
  });
});
