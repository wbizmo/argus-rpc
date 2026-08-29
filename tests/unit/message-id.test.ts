import { describe, expect, it } from "vitest";
import { ARGUS_MAX_MESSAGE_ID, MessageIdAllocator } from "../../src";

describe("MessageIdAllocator", () => {
  it("wraps from uint32 max back to one", () => {
    const allocator = new MessageIdAllocator();
    allocator.setNextForTesting(ARGUS_MAX_MESSAGE_ID);

    expect(allocator.allocate(new Set())).toBe(ARGUS_MAX_MESSAGE_ID);
    expect(allocator.allocate(new Set())).toBe(1);
  });

  it("skips identifiers that are still in flight after wraparound", () => {
    const allocator = new MessageIdAllocator();
    allocator.setNextForTesting(ARGUS_MAX_MESSAGE_ID);
    const inUse = new Set<number>([ARGUS_MAX_MESSAGE_ID, 1]);

    expect(allocator.allocate(inUse)).toBe(2);
  });

  it("never emits zero because zero is reserved for connection-level errors", () => {
    const allocator = new MessageIdAllocator();
    allocator.setNextForTesting(ARGUS_MAX_MESSAGE_ID);
    allocator.allocate(new Set());
    expect(allocator.allocate(new Set())).toBe(1);
  });
});
