// Global queue stored on globalThis so it survives Next.js module reloads.
// Ensures only one mod generation runs at a time, preventing resource exhaustion
// on hosts with process/thread limits.
const QUEUE_KEY = '__d2r_gen_queue__';
const QUEUE_DEPTH_KEY = '__d2r_gen_depth__';

export function getQueueDepth(): number {
  return ((globalThis as Record<string, unknown>)[QUEUE_DEPTH_KEY] as number) || 0;
}

export function enqueueGeneration<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  if (!g[QUEUE_KEY]) g[QUEUE_KEY] = Promise.resolve();
  if (!g[QUEUE_DEPTH_KEY]) g[QUEUE_DEPTH_KEY] = 0;
  g[QUEUE_DEPTH_KEY] = (g[QUEUE_DEPTH_KEY] as number) + 1;
  const queue = g[QUEUE_KEY] as Promise<unknown>;
  const wrapped = () => Promise.resolve().then(fn).finally(() => {
    g[QUEUE_DEPTH_KEY] = (g[QUEUE_DEPTH_KEY] as number) - 1;
  });
  const next = queue.then(() => wrapped(), () => wrapped()); // run even if previous errored
  g[QUEUE_KEY] = next.then(() => {}, () => {}); // advance queue regardless of result
  return next;
}
