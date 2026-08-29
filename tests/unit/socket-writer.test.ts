import { EventEmitter } from "node:events";
import type net from "node:net";
import { describe, expect, it } from "vitest";
import { SocketWriter } from "../../src";

class BackpressuredSocket extends EventEmitter {
  destroyed = false;
  private callback: ((error?: Error | null) => void) | null = null;

  write(_buffer: Buffer, callback?: (error?: Error | null) => void): boolean {
    this.callback = callback ?? null;
    return false;
  }

  completeWrite(): void {
    const callback = this.callback;
    this.callback = null;
    callback?.();
    this.emit("drain");
  }
}

describe("SocketWriter lifecycle races", () => {
  it("does not double-settle or underflow queued bytes when closed during backpressure", async () => {
    const socket = new BackpressuredSocket();
    const writer = new SocketWriter(socket as unknown as net.Socket, {
      maxQueuedBytes: 16
    });

    const write = writer.write(Buffer.from("abcd"));
    expect(writer.pendingBytes).toBe(4);

    writer.close();

    await expect(write).rejects.toThrow("Argus socket writer closed");
    expect(writer.pendingBytes).toBe(0);

    socket.completeWrite();
    await Promise.resolve();

    expect(writer.pendingBytes).toBe(0);
    await expect(writer.write(Buffer.from("x"))).rejects.toThrow(
      "Cannot write to a closed Argus socket"
    );
  });
});
