import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export async function findTripwireConfig(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, 'tripwire.yaml');
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep walking toward the filesystem root.
    }

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
