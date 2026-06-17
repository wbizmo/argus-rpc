import net from "node:net";
import { describe, expect, it } from "vitest";
import { ConnectionManager } from "../../src";

describe("ConnectionManager", () => {
  it("tracks sockets", () => {
    const manager = new ConnectionManager();
    const socket = new net.Socket();

    manager.add(socket);

    expect(manager.count()).toBe(1);

    manager.remove(socket);

    expect(manager.count()).toBe(0);
  });

  it("destroys sockets", () => {
    const manager = new ConnectionManager();
    const socket = new net.Socket();

    manager.add(socket);
    manager.destroy(socket);

    expect(manager.count()).toBe(0);
    expect(socket.destroyed).toBe(true);
  });

  it("destroys all sockets", () => {
    const manager = new ConnectionManager();
    const first = new net.Socket();
    const second = new net.Socket();

    manager.add(first);
    manager.add(second);

    manager.destroyAll();

    expect(manager.count()).toBe(0);
    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(true);
  });
});
