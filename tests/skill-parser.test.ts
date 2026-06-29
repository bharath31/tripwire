import { describe, it, expect } from 'vitest';
import { parseSkill, resolveSkillFilePath } from '../src/skill-parser.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) => join(__dirname, 'fixtures', name);

describe('parseSkill', () => {
  it('extracts frontmatter and body from a valid skill file', async () => {
    const result = await parseSkill(fixturePath('valid-skill.md'));
    expect(result.frontmatter.name).toBe('my-skill');
    expect(result.frontmatter.description).toBe('Use when doing something specific with code');
    expect(result.body).toContain('## Instructions');
    expect(result.filePath).toContain('valid-skill.md');
  });

  it('returns empty frontmatter when file has no YAML block', async () => {
    const result = await parseSkill(fixturePath('invalid-skill.md'));
    expect(result.frontmatter.name).toBeUndefined();
    expect(result.frontmatter.description).toBeUndefined();
    expect(result.body).toContain('No frontmatter here');
  });

  it('throws ENOENT if file does not exist', async () => {
    await expect(parseSkill('/nonexistent/path/skill.md')).rejects.toThrow('ENOENT');
  });
});

describe('resolveSkillFilePath', () => {
  it('returns the path unchanged when given a .md file', async () => {
    const p = fixturePath('valid-skill.md');
    expect(await resolveSkillFilePath(p)).toBe(p);
  });

  it('finds SKILL.md when given a directory', async () => {
    const tmp = await mkdtemp(join(os.tmpdir(), 'tripwire-'));
    await writeFile(join(tmp, 'SKILL.md'), '---\nname: x\n---\nBody');
    const resolved = await resolveSkillFilePath(tmp);
    expect(resolved).toBe(join(tmp, 'SKILL.md'));
    await rm(tmp, { recursive: true });
  });

  it('throws when directory has no .md file', async () => {
    const tmp = await mkdtemp(join(os.tmpdir(), 'tripwire-'));
    await expect(resolveSkillFilePath(tmp)).rejects.toThrow('No skill .md file found');
    await rm(tmp, { recursive: true });
  });
});
