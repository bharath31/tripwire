import { describe, it, expect } from 'vitest';
import { parseGeminiTranscript } from '../../src/analyze/gemini-transcript-parser.js';

function activateSkillEvent(name: string): string {
  return JSON.stringify({ type: 'tool_use', tool_name: 'activate_skill', tool_id: 't1', parameters: { name } });
}

describe('parseGeminiTranscript', () => {
  it('detects activation from an activate_skill tool_use event', () => {
    const result = parseGeminiTranscript(activateSkillEvent('brainstorming'));
    expect(result.activated).toBe(true);
    expect(result.skillName).toBe('brainstorming');
  });

  it('returns false for empty output', () => {
    expect(parseGeminiTranscript('').activated).toBe(false);
  });

  it('ignores non-activate_skill tool_use events', () => {
    const ev = JSON.stringify({ type: 'tool_use', tool_name: 'run_shell_command', parameters: { command: 'ls' } });
    expect(parseGeminiTranscript(ev).activated).toBe(false);
  });

  it('skips malformed (non-JSON) lines without throwing', () => {
    const mixed = `some plain log line\n${activateSkillEvent('brainstorming')}\nanother log`;
    const result = parseGeminiTranscript(mixed);
    expect(result.activated).toBe(true);
    expect(result.skillName).toBe('brainstorming');
  });

  it('handles multi-line streamed events, one per line', () => {
    const stream = [
      JSON.stringify({ type: 'init' }),
      JSON.stringify({ type: 'message', role: 'assistant', content: 'thinking...' }),
      activateSkillEvent('test-driven-development'),
      JSON.stringify({ type: 'tool_result', tool_id: 't1', status: 'success' }),
      JSON.stringify({ type: 'result', response: 'done' }),
    ].join('\n');
    const result = parseGeminiTranscript(stream);
    expect(result.activated).toBe(true);
    expect(result.skillName).toBe('test-driven-development');
  });

  describe('target skill matching', () => {
    it('activates when the fired skill matches a bare target name', () => {
      const result = parseGeminiTranscript(activateSkillEvent('superpowers:brainstorming'), 'brainstorming');
      expect(result.activated).toBe(true);
    });

    it('activates when the fired skill matches a fully-qualified target', () => {
      const result = parseGeminiTranscript(activateSkillEvent('superpowers:brainstorming'), 'superpowers:brainstorming');
      expect(result.activated).toBe(true);
    });

    it('does NOT activate when a different skill fires than the target', () => {
      const result = parseGeminiTranscript(activateSkillEvent('writing-plans'), 'brainstorming');
      expect(result.activated).toBe(false);
      expect(result.skillName).toBe('writing-plans');
    });
  });
});
