import { ARGUS_MAX_MESSAGE_ID } from "../protocol";
import { ArgusError } from "../errors";

export class MessageIdAllocator {
  private next = 1;

  allocate(inUse: ReadonlySet<number>): number {
    const attempts = inUse.size + 1;

    for (let index = 0; index < attempts; index += 1) {
      const candidate = this.next;
      this.next = candidate >= ARGUS_MAX_MESSAGE_ID ? 1 : candidate + 1;

      if (!inUse.has(candidate)) {
        return candidate;
      }
    }

    throw new ArgusError({
      code: "ARGUS_MESSAGE_ID_EXHAUSTED",
      message: "No free Argus message identifier is available"
    });
  }

  /** Test and diagnostic hook; normal callers should not mutate allocator position. */
  setNextForTesting(next: number): void {
    if (!Number.isInteger(next) || next < 1 || next > ARGUS_MAX_MESSAGE_ID) {
      throw new Error("ARGUS_INVALID_MESSAGE_ID_CURSOR");
    }
    this.next = next;
  }
}
