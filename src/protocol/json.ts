export function parsePayload<T = unknown>(payload: Buffer): T {
  if (payload.length === 0) {
    return undefined as T;
  }

  return JSON.parse(payload.toString("utf8")) as T;
}

export function serializePayload(payload: unknown): Buffer {
  if (payload === undefined || payload === null) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(payload)) {
    return payload;
  }

  if (typeof payload === "string") {
    return Buffer.from(payload, "utf8");
  }

  return Buffer.from(JSON.stringify(payload), "utf8");
}
