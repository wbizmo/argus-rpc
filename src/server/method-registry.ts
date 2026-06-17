export type ArgusMethodHandler = (payload: unknown) => Promise<unknown> | unknown;

export class MethodRegistry {
  private readonly handlers = new Map<string, ArgusMethodHandler>();

  register(method: string, handler: ArgusMethodHandler): void {
    if (!method || typeof method !== "string") {
      throw new Error("ARGUS_INVALID_METHOD_NAME");
    }

    if (this.handlers.has(method)) {
      throw new Error("ARGUS_METHOD_ALREADY_REGISTERED");
    }

    this.handlers.set(method, handler);
  }

  has(method: string): boolean {
    return this.handlers.has(method);
  }

  async execute(method: string, payload: unknown): Promise<unknown> {
    const handler = this.handlers.get(method);

    if (!handler) {
      throw new Error("ARGUS_METHOD_NOT_FOUND");
    }

    return handler(payload);
  }

  list(): string[] {
    return Array.from(this.handlers.keys()).sort();
  }

  clear(): void {
    this.handlers.clear();
  }
}
