import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { ParsedSkill } from './types.js';

export async function parseSkill(filePath: string): Promise<ParsedSkill> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as Partial<{ name: string; description: string; [k: string]: unknown }>,
    body: parsed.content.trim(),
    filePath,
  };
}

export async function resolveSkillFilePath(arg: string): Promise<string> {
  const s = await stat(arg);
  if (!s.isDirectory()) return arg;

  for (const candidate of ['SKILL.md', 'skill.md']) {
    try {
      const p = join(arg, candidate);
      await stat(p);
      return p;
    } catch {}
  }
  throw new Error(`No skill .md file found in directory: ${arg}`);
}

const IGNORED_DIR_NAMES = new Set(['node_modules', '.git']);

/** Recursively finds every SKILL.md (or skill.md) under a directory tree. */
export async function discoverSkillFiles(rootDir: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name)) continue;
        await walk(join(dir, entry.name));
      } else if (entry.isFile() && /^skill\.md$/i.test(entry.name)) {
        found.push(join(dir, entry.name));
      }
    }
  }

  await walk(rootDir);
  return found.sort();
}
