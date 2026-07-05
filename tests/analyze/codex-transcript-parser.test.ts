import { describe, it, expect } from 'vitest';
import { parseCodexTranscript } from '../../src/analyze/codex-transcript-parser.js';

function commandEvent(command: string): string {
  return JSON.stringify({
    type: 'item.completed',
    item: { id: 'i1', type: 'command_execution', command, aggregated_output: '', exit_code: 0, status: 'completed' },
  });
}

describe('parseCodexTranscript', () => {
  it('detects a skill reference from a command reading its SKILL.md', () => {
    const result = parseCodexTranscript(commandEvent('cat .codex/skills/brainstorming/SKILL.md'));
    expect(result.activated).toBe(true);
    expect(result.skillName).toBe('brainstorming');
  });

  it('matches skills under .agents/skills/ too', () => {
    const result = parseCodexTranscript(commandEvent('cat .agents/skills/writing-plans/SKILL.md'));
    expect(result.activated).toBe(true);
    expect(result.skillName).toBe('writing-plans');
  });

  it('returns false for empty output', () => {
    expect(parseCodexTranscript('').activated).toBe(false);
  });

  it('ignores command_execution events unrelated to any skill', () => {
    const result = parseCodexTranscript(commandEvent('ls -la'));
    expect(result.activated).toBe(false);
  });

  it('ignores non-command_execution item types', () => {
    const ev = JSON.stringify({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: 'mentions skills/brainstorming/SKILL.md but is not a command' } });
    expect(parseCodexTranscript(ev).activated).toBe(false);
  });

  it('skips malformed (non-JSON) lines without throwing', () => {
    const mixed = `some plain log line\n${commandEvent('cat .codex/skills/brainstorming/SKILL.md')}\nanother log`;
    const result = parseCodexTranscript(mixed);
    expect(result.activated).toBe(true);
  });

  describe('target skill matching', () => {
    it('activates when the referenced skill matches the bare target name', () => {
      const result = parseCodexTranscript(commandEvent('cat .codex/skills/brainstorming/SKILL.md'), 'brainstorming');
      expect(result.activated).toBe(true);
    });

    it('does NOT activate when a different skill is referenced than the target', () => {
      const result = parseCodexTranscript(commandEvent('cat .codex/skills/writing-plans/SKILL.md'), 'brainstorming');
      expect(result.activated).toBe(false);
      expect(result.skillName).toBe('writing-plans');
    });
  });
});
