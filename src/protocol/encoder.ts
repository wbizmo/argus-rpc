import { getFrameSize, validateFrame } from "./frame";
import {
  ARGUS_MAGIC,
  ARGUS_VERSION,
  ArgusFrame
} from "./types";

export function encodeFrame(frame: ArgusFrame): Buffer {
  validateFrame(frame);

  const methodBuffer = Buffer.from(frame.method, "utf8");
  const frameSize = getFrameSize(frame);
  const buffer = Buffer.alloc(frameSize);

  let offset = 0;

  buffer.write(ARGUS_MAGIC, offset, 2, "ascii");
  offset += 2;

  buffer.writeUInt8(ARGUS_VERSION, offset);
  offset += 1;

  buffer.writeUInt8(frame.type, offset);
  offset += 1;

  buffer.writeUInt32BE(frame.messageId, offset);
  offset += 4;

  buffer.writeUInt16BE(methodBuffer.length, offset);
  offset += 2;

  buffer.writeUInt32BE(frame.payload.length, offset);
  offset += 4;

  methodBuffer.copy(buffer, offset);
  offset += methodBuffer.length;

  frame.payload.copy(buffer, offset);

  return buffer;
}
