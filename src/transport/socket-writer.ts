import type net from "node:net";
import { ArgusError } from "../errors";

export interface SocketWriterOptions {
  maxQueuedBytes?: number;
}

interface QueuedWrite {
  buffer: Buffer;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class SocketWriter {
  private readonly queue: QueuedWrite[] = [];
  private readonly maxQueuedBytes: number;
  private queuedBytes = 0;
  private writing = false;
  private closed = false;

  constructor(
    private readonly socket: net.Socket,
    options: SocketWriterOptions = {}
  ) {
    this.maxQueuedBytes = options.maxQueuedBytes ?? 4 * 1024 * 1024;

    if (!Number.isSafeInteger(this.maxQueuedBytes) || this.maxQueuedBytes < 1) {
      throw new ArgusError({
        code: "ARGUS_INVALID_WRITE_QUEUE_LIMIT",
        message: "Socket write queue limit must be a positive safe integer"
      });
    }
  }

  get pendingBytes(): number {
    return this.queuedBytes;
  }

  async write(buffer: Buffer): Promise<void> {
    if (this.closed || this.socket.destroyed) {
      throw new ArgusError({
        code: "ARGUS_SOCKET_CLOSED",
        message: "Cannot write to a closed Argus socket"
      });
    }

    if (this.queuedBytes + buffer.length > this.maxQueuedBytes) {
      throw new ArgusError({
        code: "ARGUS_WRITE_QUEUE_FULL",
        message: "Argus socket write queue limit exceeded",
        details: {
          queuedBytes: this.queuedBytes,
          attemptedBytes: buffer.length,
          maxQueuedBytes: this.maxQueuedBytes
        }
      });
    }

    this.queuedBytes += buffer.length;

    await new Promise<void>((resolve, reject) => {
      this.queue.push({ buffer, resolve, reject });
      this.pump();
    });
  }

  close(error = new ArgusError({
    code: "ARGUS_SOCKET_WRITER_CLOSED",
    message: "Argus socket writer closed"
  })): void {
    if (this.closed) return;
    this.closed = true;

    for (const item of this.queue.splice(0)) {
      item.reject(error);
    }

    this.queuedBytes = 0;
    this.writing = false;
    this.socket.removeAllListeners("drain");
  }

  private pump(): void {
    if (this.writing || this.closed) return;

    const item = this.queue[0];
    if (!item) return;

    this.writing = true;
    let callbackDone = false;
    let drained = false;
    let accepted = true;
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) return;

      if (this.closed) {
        settled = true;
        this.socket.off("drain", onDrain);
        return;
      }

      if (!error && (!callbackDone || (!accepted && !drained))) return;

      settled = true;
      this.socket.off("drain", onDrain);

      if (this.queue[0] === item) {
        this.queue.shift();
        this.queuedBytes = Math.max(0, this.queuedBytes - item.buffer.length);
      }

      this.writing = false;

      if (error) item.reject(error);
      else item.resolve();

      this.pump();
    };

    const onDrain = (): void => {
      drained = true;
      finish();
    };

    try {
      accepted = this.socket.write(item.buffer, (error?: Error | null) => {
        callbackDone = true;
        if (error) {
          finish(error);
          return;
        }
        finish();
      });

      if (!accepted && !this.closed) {
        this.socket.once("drain", onDrain);
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
