import {
  ARGUS_HEADER_LENGTH,
  normalizeProtocolLimits,
  type ArgusFrame,
  type ArgusProtocolLimits
} from "../protocol";
import {
  decodeFrameFromValidatedHeader,
  decodeFrameHeaderWithNormalizedLimits
} from "../protocol/decoder";
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
      const encodedHeader = this.queue.peek(ARGUS_HEADER_LENGTH);
      const header = decodeFrameHeaderWithNormalizedLimits(encodedHeader, this.limits);
      if (!header) throw new Error("ARGUS_STREAM_DECODER_INVARIANT");
      if (this.queue.length < header.totalLength) break;

      const encoded = this.queue.read(header.totalLength);
      const decoded = decodeFrameFromValidatedHeader(encoded, header);
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
