import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"passed":true,"reasoning":"asks a clarifying question"}' }],
      }),
    },
  })),
}));

describe('judgeRubric', () => {
  it('parses passed and reasoning from the judge response', async () => {
    const { judgeRubric } = await import('../../src/eval/rubric-judge.js');
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new (Anthropic as unknown as new (opts: unknown) => { messages: { create: () => unknown } })({ apiKey: 'key' });
    const result = await judgeRubric('output text', 'must ask a question', client as never, 'claude-haiku-4-5-20251001');
    expect(result).toEqual({ passed: true, reasoning: 'asks a clarifying question' });
  });

  it('returns passed:false with an error reasoning when the response is not valid JSON', async () => {
    const Sdk = (await import('@anthropic-ai/sdk')).default as ReturnType<typeof vi.fn>;
    Sdk.mockImplementationOnce(() => ({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] }) },
    }));
    const { judgeRubric } = await import('../../src/eval/rubric-judge.js');
    const client = new Sdk({ apiKey: 'key' });
    const result = await judgeRubric('output', 'rubric', client, 'model');
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('Failed to parse');
  });

  it('coerces a truthy non-boolean "passed" field to a real boolean', async () => {
    const Sdk = (await import('@anthropic-ai/sdk')).default as ReturnType<typeof vi.fn>;
    Sdk.mockImplementationOnce(() => ({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"passed":"yes","reasoning":"x"}' }] }) },
    }));
    const { judgeRubric } = await import('../../src/eval/rubric-judge.js');
    const client = new Sdk({ apiKey: 'key' });
    const result = await judgeRubric('output', 'rubric', client, 'model');
    expect(result.passed).toBe(true);
  });
});
