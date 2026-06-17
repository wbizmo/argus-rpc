import net from "node:net";

export class ConnectionManager {
  private readonly sockets = new Set<net.Socket>();

  add(socket: net.Socket): void {
    this.sockets.add(socket);

    socket.once("close", () => {
      this.remove(socket);
    });

    socket.once("error", () => {
      this.destroy(socket);
    });
  }

  remove(socket: net.Socket): void {
    this.sockets.delete(socket);
  }

  destroy(socket: net.Socket): void {
    this.sockets.delete(socket);
    socket.destroy();
  }

  destroyAll(): void {
    for (const socket of this.sockets) {
      socket.destroy();
    }

    this.sockets.clear();
  }

  count(): number {
    return this.sockets.size;
  }
}
