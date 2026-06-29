import { describe, it, expect, vi } from 'vitest';
import type { ProbeResult, ParsedSkill } from '../../src/types.js';
import { defaultConfig } from '../../src/config.js';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"score":8,"violations":["Did not cite spec"]}' }],
      }),
    },
  })),
}));

const skill: ParsedSkill = {
  frontmatter: { name: 'brainstorming', description: 'Use when creating features' },
  body: '## Instructions\nBrainstorm first.',
  filePath: '/fake/brainstorming.md',
};

const activated: ProbeResult = {
  prompt: { zone: 'core', prompt: 'build a new feature' },
  transcript: { activated: true, skillName: 'brainstorming', rawOutput: 'Launching skill: brainstorming\nContent' },
};

const notActivated: ProbeResult = {
  prompt: { zone: 'negative', prompt: 'fix a bug' },
  transcript: { activated: false, rawOutput: 'Just fixed the bug' },
};

describe('judgeActivatedSessions', () => {
  it('adds judge to activated sessions', async () => {
    const { judgeActivatedSessions } = await import('../../src/analyze/judge.js');
    const results = await judgeActivatedSessions([activated, notActivated], skill, defaultConfig, 'key');
    expect(results[0].judge).toBeDefined();
    expect(results[1].judge).toBeUndefined();
  });

  it('parses score and violations from response', async () => {
    const { judgeActivatedSessions } = await import('../../src/analyze/judge.js');
    const results = await judgeActivatedSessions([activated], skill, defaultConfig, 'key');
    expect(results[0].judge?.score).toBe(8);
    expect(results[0].judge?.violations).toEqual(['Did not cite spec']);
  });

  it('returns score 0 and error message when response is not valid JSON', async () => {
    const Sdk = (await import('@anthropic-ai/sdk')).default as ReturnType<typeof vi.fn>;
    Sdk.mockImplementationOnce(() => ({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] }) },
    }));
    const { judgeActivatedSessions } = await import('../../src/analyze/judge.js');
    const results = await judgeActivatedSessions([activated], skill, defaultConfig, 'key');
    expect(results[0].judge?.score).toBe(0);
    expect(results[0].judge?.violations[0]).toContain('Failed to parse');
  });
});
