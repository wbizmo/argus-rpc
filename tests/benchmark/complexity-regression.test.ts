import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("v2.1 complexity regression guards", () => {
  it("does not rebuild the pending message-id collection per allocation", () => {
    expect(source("src/client/ArgusClient.ts")).not.toContain("new Set(this.pending.keys())");
  });

  it.each([
    "src/server/concurrency-limiter.ts",
    "src/transport/chunk-queue.ts",
    "src/transport/socket-writer.ts",
    "src/client/connection-pool.ts"
  ])("keeps FIFO hot path free of Array.shift(): %s", (path) => {
    expect(source(path)).not.toMatch(/\.shift\s*\(/);
  });

  it("does not enumerate message types on every decoded frame", () => {
    expect(source("src/protocol/decoder.ts")).not.toContain("Object.values(ArgusMessageType)");
  });

  it("does not enumerate remote statuses on every error frame", () => {
    expect(source("src/client/ArgusClient.ts")).not.toContain("Object.values(ArgusStatus)");
  });

  it("does not sort method names merely to count them", () => {
    expect(source("src/server/ArgusServer.ts")).not.toContain("registry.list().length");
  });

  it("does not remove unrelated socket drain listeners", () => {
    expect(source("src/transport/socket-writer.ts")).not.toContain(
      'removeAllListeners("drain")'
    );
  });
});
