// Global queue stored on globalThis so it survives Next.js module reloads.
// Ensures only one mod generation runs at a time, preventing resource exhaustion
// on hosts with process/thread limits.
const QUEUE_KEY = '__d2r_gen_queue__';

export function enqueueGeneration<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  if (!g[QUEUE_KEY]) g[QUEUE_KEY] = Promise.resolve();
  const queue = g[QUEUE_KEY] as Promise<unknown>;
  const next = queue.then(() => fn(), () => fn()); // run even if previous errored
  g[QUEUE_KEY] = next.then(() => {}, () => {}); // advance queue regardless of result
  return next;
}
