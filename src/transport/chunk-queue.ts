export class ChunkQueue {
  private readonly chunks: Buffer[] = [];
  private headOffset = 0;
  private byteLength = 0;

  get length(): number {
    return this.byteLength;
  }

  append(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.byteLength += chunk.length;
  }

  peek(length: number): Buffer {
    this.assertReadable(length);
    if (length === 0) return Buffer.alloc(0);

    const head = this.chunks[0];
    if (head && head.length - this.headOffset >= length) {
      return head.subarray(this.headOffset, this.headOffset + length);
    }

    const output = Buffer.allocUnsafe(length);
    this.copyInto(output, length);
    return output;
  }

  read(length: number): Buffer {
    this.assertReadable(length);
    if (length === 0) return Buffer.alloc(0);

    const head = this.chunks[0];
    if (head && head.length - this.headOffset >= length) {
      const output = head.subarray(this.headOffset, this.headOffset + length);
      this.headOffset += length;
      this.byteLength -= length;
      this.compactHead();
      return output;
    }

    const output = Buffer.allocUnsafe(length);
    let written = 0;

    while (written < length) {
      const chunk = this.chunks[0];
      if (!chunk) throw new Error("ARGUS_CHUNK_QUEUE_UNDERFLOW");

      const available = chunk.length - this.headOffset;
      const take = Math.min(available, length - written);
      chunk.copy(output, written, this.headOffset, this.headOffset + take);
      written += take;
      this.headOffset += take;
      this.byteLength -= take;
      this.compactHead();
    }

    return output;
  }

  clear(): void {
    this.chunks.length = 0;
    this.headOffset = 0;
    this.byteLength = 0;
  }

  private assertReadable(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new Error("ARGUS_INVALID_CHUNK_READ_LENGTH");
    }
    if (length > this.byteLength) {
      throw new Error("ARGUS_CHUNK_QUEUE_UNDERFLOW");
    }
  }

  private compactHead(): void {
    const head = this.chunks[0];
    if (head && this.headOffset >= head.length) {
      this.chunks.shift();
      this.headOffset = 0;
    }
  }

  private copyInto(target: Buffer, length: number): void {
    let remaining = length;
    let targetOffset = 0;
    let index = 0;
    let sourceOffset = this.headOffset;

    while (remaining > 0) {
      const chunk = this.chunks[index];
      if (!chunk) throw new Error("ARGUS_CHUNK_QUEUE_UNDERFLOW");
      const available = chunk.length - sourceOffset;
      const take = Math.min(available, remaining);
      chunk.copy(target, targetOffset, sourceOffset, sourceOffset + take);
      targetOffset += take;
      remaining -= take;
      index += 1;
      sourceOffset = 0;
    }
  }
}
