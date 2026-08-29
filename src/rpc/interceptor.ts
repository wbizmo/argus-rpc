import type { ArgusCallContext } from "./call-context";

export type ArgusServerNext = (payload: unknown, context: ArgusCallContext) => Promise<unknown>;

export type ArgusServerInterceptor = (
  payload: unknown,
  context: ArgusCallContext,
  next: ArgusServerNext
) => Promise<unknown>;

export function composeServerInterceptors(
  interceptors: readonly ArgusServerInterceptor[],
  terminal: ArgusServerNext
): ArgusServerNext {
  return interceptors.reduceRight<ArgusServerNext>((next, interceptor) => {
    return async (payload, context) => {
      let called = false;
      const guardedNext: ArgusServerNext = async (nextPayload, nextContext) => {
        if (called) throw new Error("ARGUS_INTERCEPTOR_NEXT_CALLED_TWICE");
        called = true;
        return next(nextPayload, nextContext);
      };
      return interceptor(payload, context, guardedNext);
    };
  }, terminal);
}
