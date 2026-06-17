import { describe, expect, it } from "vitest";
import {
  createPingFrame,
  createPongFrame,
  isPingFrame,
  isPongFrame
} from "../../src";

describe("heartbeat helpers", () => {
  it("creates ping frames", () => {
    const frame = createPingFrame(1);

    expect(isPingFrame(frame)).toBe(true);
    expect(isPongFrame(frame)).toBe(false);
  });

  it("creates pong frames", () => {
    const frame = createPongFrame(1);

    expect(isPongFrame(frame)).toBe(true);
    expect(isPingFrame(frame)).toBe(false);
  });
});
