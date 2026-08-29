export interface ArgusCodec<T = unknown> {
  readonly name: string;
  encode(value: T): Buffer;
  decode(buffer: Buffer): T;
}

export const jsonCodec: ArgusCodec = Object.freeze({
  name: "json",
  encode(value: unknown): Buffer {
    if (value === undefined) return Buffer.alloc(0);
    return Buffer.from(JSON.stringify(value), "utf8");
  },
  decode(buffer: Buffer): unknown {
    if (buffer.length === 0) return undefined;
    return JSON.parse(buffer.toString("utf8")) as unknown;
  }
});

export const rawCodec: ArgusCodec<Buffer> = Object.freeze({
  name: "raw",
  encode(value: Buffer): Buffer {
    if (!Buffer.isBuffer(value)) {
      throw new Error("ARGUS_RAW_CODEC_REQUIRES_BUFFER");
    }
    return Buffer.from(value);
  },
  decode(buffer: Buffer): Buffer {
    return Buffer.from(buffer);
  }
});

export class ArgusCodecRegistry {
  private readonly codecs = new Map<string, ArgusCodec>();

  constructor(codecs: readonly ArgusCodec[] = [jsonCodec, rawCodec]) {
    for (const codec of codecs) this.register(codec);
  }

  register(codec: ArgusCodec): this {
    const name = normalizeCodecName(codec.name);
    if (this.codecs.has(name)) {
      throw new Error("ARGUS_CODEC_ALREADY_REGISTERED");
    }
    this.codecs.set(name, codec);
    return this;
  }

  get(name: string): ArgusCodec {
    const normalized = normalizeCodecName(name);
    const codec = this.codecs.get(normalized);
    if (!codec) throw new Error("ARGUS_CODEC_NOT_FOUND");
    return codec;
  }

  has(name: string): boolean {
    return this.codecs.has(normalizeCodecName(name));
  }

  list(): string[] {
    return [...this.codecs.keys()].sort();
  }
}

function normalizeCodecName(name: string): string {
  if (typeof name !== "string") throw new Error("ARGUS_INVALID_CODEC_NAME");
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) {
    throw new Error("ARGUS_INVALID_CODEC_NAME");
  }
  return normalized;
}
