import { parsePayload, serializePayload } from "../protocol/json";

export type ArgusMetadata = Record<string, string>;

export interface ArgusRequestEnvelopeOptions {
  deadlineUnixMs?: number;
  metadata?: ArgusMetadata;
}

export interface DecodedArgusRequest {
  payload: unknown;
  deadlineUnixMs?: number;
  metadata: ArgusMetadata;
}

const REQUEST_ENVELOPE_MARKER = "argus.request.v2";

export function encodeRequestEnvelope(
  payload: unknown,
  options: ArgusRequestEnvelopeOptions = {}
): Buffer {
  return serializePayload({
    $argus: REQUEST_ENVELOPE_MARKER,
    deadlineUnixMs: options.deadlineUnixMs,
    metadata: options.metadata ?? {},
    payload
  });
}

export function decodeRequestEnvelope(buffer: Buffer): DecodedArgusRequest {
  const parsed = parsePayload(buffer);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { payload: parsed, metadata: {} };
  }

  const candidate = parsed as {
    $argus?: unknown;
    deadlineUnixMs?: unknown;
    metadata?: unknown;
    payload?: unknown;
  };

  if (candidate.$argus !== REQUEST_ENVELOPE_MARKER) {
    return { payload: parsed, metadata: {} };
  }

  const deadlineUnixMs = typeof candidate.deadlineUnixMs === "number" &&
    Number.isSafeInteger(candidate.deadlineUnixMs)
      ? candidate.deadlineUnixMs
      : undefined;

  return {
    payload: candidate.payload,
    deadlineUnixMs,
    metadata: normalizeMetadata(candidate.metadata)
  };
}

export function normalizeMetadata(value: unknown): ArgusMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const metadata: ArgusMetadata = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== "string") continue;
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey || normalizedKey.length > 128 || rawValue.length > 4096) continue;
    metadata[normalizedKey] = rawValue;
  }
  return metadata;
}
