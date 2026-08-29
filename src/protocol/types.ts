export const ARGUS_MAGIC = "AR";
export const ARGUS_MAGIC_LENGTH = 2;
export const ARGUS_VERSION = 2;
export const ARGUS_HEADER_LENGTH = 14;
export const ARGUS_MAX_MESSAGE_ID = 0xffffffff;

export enum ArgusMessageType {
  REQUEST = 1,
  RESPONSE = 2,
  ERROR = 3,
  PING = 4,
  PONG = 5,
  CANCEL = 6
}

export interface ArgusFrame {
  type: ArgusMessageType;
  messageId: number;
  method: string;
  payload: Buffer;
}

export interface EncodedArgusFrame {
  buffer: Buffer;
}
