import { describe, it, expect } from 'vitest';
import { parseSkill, resolveSkillFilePath, discoverSkillFiles } from '../src/skill-parser.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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

describe('discoverSkillFiles', () => {
  it('finds every SKILL.md nested under a directory tree', async () => {
    const tmp = await mkdtemp(join(os.tmpdir(), 'tripwire-discover-'));
    await mkdir(join(tmp, 'a'), { recursive: true });
    await mkdir(join(tmp, 'b', 'nested'), { recursive: true });
    await writeFile(join(tmp, 'a', 'SKILL.md'), 'a');
    await writeFile(join(tmp, 'b', 'nested', 'SKILL.md'), 'b');
    await writeFile(join(tmp, 'b', 'not-a-skill.md'), 'ignored');

    const found = await discoverSkillFiles(tmp);
    expect(found).toEqual([join(tmp, 'a', 'SKILL.md'), join(tmp, 'b', 'nested', 'SKILL.md')]);
    await rm(tmp, { recursive: true });
  });

  it('skips node_modules and .git directories', async () => {
    const tmp = await mkdtemp(join(os.tmpdir(), 'tripwire-discover-'));
    await mkdir(join(tmp, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(tmp, '.git'), { recursive: true });
    await mkdir(join(tmp, 'real'), { recursive: true });
    await writeFile(join(tmp, 'node_modules', 'pkg', 'SKILL.md'), 'ignored');
    await writeFile(join(tmp, '.git', 'SKILL.md'), 'ignored');
    await writeFile(join(tmp, 'real', 'SKILL.md'), 'real');

    const found = await discoverSkillFiles(tmp);
    expect(found).toEqual([join(tmp, 'real', 'SKILL.md')]);
    await rm(tmp, { recursive: true });
  });

  it('returns an empty array when nothing is found', async () => {
    const tmp = await mkdtemp(join(os.tmpdir(), 'tripwire-discover-'));
    expect(await discoverSkillFiles(tmp)).toEqual([]);
    await rm(tmp, { recursive: true });
  });
});

describe('resolveLintTargets', () => {
  it('returns a file path as-is', async () => {
    const { resolveLintTargets } = await import('../src/skill-parser.js');
    const files = await resolveLintTargets(fixturePath('valid-skill.md'));
    expect(files).toEqual([fixturePath('valid-skill.md')]);
  });

  it('returns the direct SKILL.md of a skill directory', async () => {
    const { resolveLintTargets } = await import('../src/skill-parser.js');
    const dir = await mkdtemp(join(os.tmpdir(), 'tw-lint-'));
    await writeFile(join(dir, 'SKILL.md'), '---\nname: a\n---\nbody');
    const files = await resolveLintTargets(dir);
    expect(files).toEqual([join(dir, 'SKILL.md')]);
    await rm(dir, { recursive: true });
  });

  it('discovers nested <name>/SKILL.md files under a skills root (the .claude/skills layout)', async () => {
    const { resolveLintTargets } = await import('../src/skill-parser.js');
    const dir = await mkdtemp(join(os.tmpdir(), 'tw-lint-'));
    await mkdir(join(dir, 'one'), { recursive: true });
    await mkdir(join(dir, 'two'), { recursive: true });
    await writeFile(join(dir, 'one', 'SKILL.md'), '---\nname: one\n---\nbody');
    await writeFile(join(dir, 'two', 'skill.md'), '---\nname: two\n---\nbody');
    const files = await resolveLintTargets(dir);
    expect(files).toHaveLength(2);
    await rm(dir, { recursive: true });
  });

  it('throws a friendly error for a missing path', async () => {
    const { resolveLintTargets } = await import('../src/skill-parser.js');
    await expect(resolveLintTargets('/definitely/not/here')).rejects.toThrow('No such file or directory');
  });
});
