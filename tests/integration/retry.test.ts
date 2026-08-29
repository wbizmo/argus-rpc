import { afterEach, describe, expect, it } from "vitest";
import { ArgusClient, ArgusError, ArgusServer, ArgusStatus } from "../../src";

describe("Argus retry integration", () => {
  let server: ArgusServer | null = null;
  let client: ArgusClient | null = null;

  afterEach(async () => {
    await client?.close();
    await server?.close();
    client = null;
    server = null;
  });

  it("retries failures explicitly classified as transient", async () => {
    server = new ArgusServer();
    let attempts = 0;

    server.method("unstable.method", async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new ArgusError({
          code: "ARGUS_TEMPORARY_FAILURE",
          message: "temporary failure",
          status: ArgusStatus.UNAVAILABLE
        });
      }
      return { ok: true, attempts };
    });

    const port = await server.listen();
    client = new ArgusClient({
      port,
      retry: { retries: 3, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 }
    });

    await expect(client.call("unstable.method", {}, 1000)).resolves.toEqual({
      ok: true,
      attempts: 3
    });
    expect(attempts).toBe(3);
  });

  it("does not duplicate non-retryable application work by default", async () => {
    server = new ArgusServer();
    let attempts = 0;

    server.method("non.retryable", async () => {
      attempts += 1;
      throw new ArgusError({
        code: "ARGUS_BUSINESS_RULE",
        message: "business rule failed",
        status: ArgusStatus.FAILED_PRECONDITION
      });
    });

    const port = await server.listen();
    client = new ArgusClient({
      port,
      retry: { retries: 3, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 }
    });

    await expect(client.call("non.retryable", {}, 1000)).rejects.toMatchObject({
      status: ArgusStatus.FAILED_PRECONDITION
    });
    expect(attempts).toBe(1);
  });
});
