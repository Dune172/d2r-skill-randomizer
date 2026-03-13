import fs from 'fs';
import path from 'path';

// Default to one directory above the project so deployments (fresh clone/pull) can't wipe it.
// Override by setting COUNTER_FILE env var to any absolute path on the server.
const COUNTER_FILE = process.env.COUNTER_FILE || path.join(process.cwd(), '..', 'counter.json');

let writeLock: Promise<void> = Promise.resolve();

function readCount(): number {
  try {
    const raw = fs.readFileSync(COUNTER_FILE, 'utf-8');
    return JSON.parse(raw).count ?? 0;
  } catch {
    return 0;
  }
}

export function getCount(): number {
  return readCount();
}

export function incrementCount(): void {
  writeLock = writeLock.then(() => {
    const count = readCount() + 1;
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count }), 'utf-8');
  }).catch(() => {});
}
