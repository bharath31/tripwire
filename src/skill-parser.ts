import { readFile, stat } from 'node:fs/promises';
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
