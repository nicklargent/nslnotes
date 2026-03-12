/**
 * Worker pool for parallel file parsing (T7.3).
 * Uses a fixed pool of Web Workers for off-thread YAML/markdown parsing.
 */

type PendingResolve = (
  result: {
    frontmatter: Record<string, unknown>;
    body: string;
  } | null
) => void;

let pool: Worker[] = [];
let nextWorker = 0;
let nextId = 0;
const pending = new Map<number, PendingResolve>();

/**
 * Initialize the worker pool.
 * @param size Number of workers (defaults to navigator.hardwareConcurrency or 2)
 */
export function initWorkerPool(size?: number | undefined): void {
  const poolSize = size ?? Math.min(navigator.hardwareConcurrency ?? 2, 4);

  for (const w of pool) {
    w.terminate();
  }
  pool = [];
  pending.clear();

  for (let i = 0; i < poolSize; i++) {
    const worker = new Worker(
      new URL("../workers/parseWorker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (
      e: MessageEvent<{
        id: number;
        result: { frontmatter: Record<string, unknown>; body: string } | null;
      }>
    ) => {
      const { id, result } = e.data;
      const resolve = pending.get(id);
      if (resolve) {
        pending.delete(id);
        resolve(result);
      }
    };

    worker.onerror = () => {
      // If worker errors, reject all pending on this worker
    };

    pool.push(worker);
  }
}

/**
 * Parse a file's frontmatter in a worker.
 * Falls back to null if parsing fails.
 */
export function parseInWorker(
  path: string,
  content: string
): Promise<{ frontmatter: Record<string, unknown>; body: string } | null> {
  if (pool.length === 0) {
    // Workers not initialized; return null to fall back to main-thread parsing
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);

    const worker = pool[nextWorker % pool.length]!;
    nextWorker++;

    worker.postMessage({ id, type: "parse-file", path, content });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve(null);
      }
    }, 5000);
  });
}

/**
 * Terminate all workers.
 */
export function terminateWorkerPool(): void {
  for (const w of pool) {
    w.terminate();
  }
  pool = [];
  pending.clear();
}
