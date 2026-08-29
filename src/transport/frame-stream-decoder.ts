import {
  ARGUS_HEADER_LENGTH,
  decodeFrame,
  normalizeProtocolLimits,
  type ArgusFrame,
  type ArgusProtocolLimits
} from "../protocol";
import { ChunkQueue } from "./chunk-queue";

export class ArgusFrameStreamDecoder {
  private readonly queue = new ChunkQueue();
  private readonly limits: ArgusProtocolLimits;

  constructor(limits: Partial<ArgusProtocolLimits> = {}) {
    this.limits = normalizeProtocolLimits(limits);
  }

  get pendingBytes(): number {
    return this.queue.length;
  }

  push(chunk: Buffer): ArgusFrame[] {
    this.queue.append(chunk);
    const frames: ArgusFrame[] = [];

    while (this.queue.length >= ARGUS_HEADER_LENGTH) {
      const header = this.queue.peek(ARGUS_HEADER_LENGTH);
      const methodLength = header.readUInt16BE(8);
      const payloadLength = header.readUInt32BE(10);

      if (methodLength > this.limits.maxMethodBytes) {
        throw new Error("ARGUS_METHOD_TOO_LARGE");
      }
      if (payloadLength > this.limits.maxPayloadBytes) {
        throw new Error("ARGUS_PAYLOAD_TOO_LARGE");
      }

      const totalLength = ARGUS_HEADER_LENGTH + methodLength + payloadLength;
      if (totalLength > this.limits.maxFrameBytes) {
        throw new Error("ARGUS_FRAME_TOO_LARGE");
      }
      if (this.queue.length < totalLength) break;

      const encoded = this.queue.read(totalLength);
      const decoded = decodeFrame(encoded, this.limits);
      if (!decoded.frame || decoded.remaining.length !== 0) {
        throw new Error("ARGUS_STREAM_DECODER_INVARIANT");
      }
      frames.push(decoded.frame);
    }

    return frames;
  }

  reset(): void {
    this.queue.clear();
  }
}
