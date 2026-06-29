import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTranscript } from '../../src/analyze/transcript-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = (n: string) => join(__dirname, '../fixtures', n);

// Builds one stream-json line for an assistant message that fires the Skill tool.
function skillEvent(skill: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 't1', name: 'Skill', input: { skill } }] },
  });
}

describe('parseTranscript', () => {
  it('detects activation from a Skill tool_use in the stream', async () => {
    const output = await readFile(fixturePath('activated-transcript.txt'), 'utf-8');
    const result = parseTranscript(output);
    expect(result.activated).toBe(true);
    expect(result.skillName).toBe('superpowers:brainstorming');
    expect(result.rawOutput).toBe(output);
  });

  it('detects no activation when no Skill tool_use is present', async () => {
    const output = await readFile(fixturePath('not-activated-transcript.txt'), 'utf-8');
    const result = parseTranscript(output);
    expect(result.activated).toBe(false);
    expect(result.skillName).toBeUndefined();
  });

  it('returns false for empty output', () => {
    expect(parseTranscript('').activated).toBe(false);
  });

  it('extracts the fully-qualified skill id', () => {
    const result = parseTranscript(skillEvent('superpowers:test-driven-development'));
    expect(result.activated).toBe(true);
    expect(result.skillName).toBe('superpowers:test-driven-development');
  });

  it('ignores non-Skill tool_use blocks', () => {
    const ev = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls' } }] },
    });
    expect(parseTranscript(ev).activated).toBe(false);
  });

  it('skips malformed (non-JSON) lines without throwing', () => {
    const mixed = `some plain log line\n${skillEvent('superpowers:brainstorming')}\nanother log`;
    const result = parseTranscript(mixed);
    expect(result.activated).toBe(true);
    expect(result.skillName).toBe('superpowers:brainstorming');
  });

  describe('target skill matching', () => {
    it('activates when the fired skill matches a bare target name', () => {
      const result = parseTranscript(skillEvent('superpowers:brainstorming'), 'brainstorming');
      expect(result.activated).toBe(true);
    });

    it('activates when the fired skill matches a fully-qualified target', () => {
      const result = parseTranscript(
        skillEvent('superpowers:brainstorming'),
        'superpowers:brainstorming',
      );
      expect(result.activated).toBe(true);
    });

    it('does NOT activate when a different skill fires than the target', () => {
      const result = parseTranscript(skillEvent('superpowers:writing-plans'), 'brainstorming');
      expect(result.activated).toBe(false);
      // still reports what actually fired, for diagnostics
      expect(result.skillName).toBe('superpowers:writing-plans');
    });
  });
});
