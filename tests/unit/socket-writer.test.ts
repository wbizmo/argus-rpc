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

class ControlledSocket extends EventEmitter {
  destroyed = false;
  private callback: ((error?: Error | null) => void) | null = null;

  write(_buffer: Buffer, callback?: (error?: Error | null) => void): boolean {
    this.callback = callback ?? null;
    return true;
  }

  completeWrite(): void {
    const callback = this.callback;
    this.callback = null;
    callback?.();
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

  it("drains a deep serialized queue without losing order or byte accounting", async () => {
    const socket = new ControlledSocket();
    const depth = 1500;
    const writer = new SocketWriter(socket as unknown as net.Socket, {
      maxQueuedBytes: depth + 10
    });
    const writes = Array.from({ length: depth }, () => writer.write(Buffer.from("x")));

    expect(writer.pendingBytes).toBe(depth);
    for (let index = 0; index < depth; index += 1) socket.completeWrite();

    await Promise.all(writes);
    expect(writer.pendingBytes).toBe(0);
  });

  it("removes only its own drain listener when closed", async () => {
    const socket = new BackpressuredSocket();
    const externalDrainListener = () => undefined;
    socket.on("drain", externalDrainListener);
    const writer = new SocketWriter(socket as unknown as net.Socket, {
      maxQueuedBytes: 16
    });
    const write = writer.write(Buffer.from("abcd"));

    writer.close();
    await expect(write).rejects.toThrow("Argus socket writer closed");

    expect(socket.listeners("drain")).toContain(externalDrainListener);
  });
});
