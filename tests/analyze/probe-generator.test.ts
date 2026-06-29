import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedSkill } from '../../src/types.js';
import { defaultConfig } from '../../src/config.js';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            core:     Array.from({ length: 8 }, (_, i) => `core prompt ${i}`),
            adjacent: Array.from({ length: 8 }, (_, i) => `adjacent prompt ${i}`),
            negative: Array.from({ length: 8 }, (_, i) => `negative prompt ${i}`),
            variants: Array.from({ length: 5 }, (_, i) => `variant prompt ${i}`),
          }),
        }],
      }),
    },
  })),
}));

describe('generateProbeMatrix', () => {
  const skill: ParsedSkill = {
    frontmatter: { name: 'brainstorming', description: 'Use when creating features' },
    body: '## Instructions\nBrainstorm before implementing.',
    filePath: '/fake/brainstorming.md',
  };

  it('returns a matrix with skillName set', async () => {
    const { generateProbeMatrix } = await import('../../src/analyze/probe-generator.js');
    const matrix = await generateProbeMatrix(skill, defaultConfig, 'fake-key');
    expect(matrix.skillName).toBe('brainstorming');
  });

  it('generates prompts across all 4 zones', async () => {
    const { generateProbeMatrix } = await import('../../src/analyze/probe-generator.js');
    const matrix = await generateProbeMatrix(skill, defaultConfig, 'fake-key');

    const zones = ['core', 'adjacent', 'negative', 'variants'] as const;
    for (const zone of zones) {
      expect(matrix.prompts.some(p => p.zone === zone)).toBe(true);
    }
  });

  it('slices prompts to configured counts', async () => {
    const { generateProbeMatrix } = await import('../../src/analyze/probe-generator.js');
    const matrix = await generateProbeMatrix(skill, defaultConfig, 'fake-key');

    const count = (zone: string) => matrix.prompts.filter(p => p.zone === zone).length;
    expect(count('core')).toBe(defaultConfig.probe_count.core);
    expect(count('adjacent')).toBe(defaultConfig.probe_count.adjacent);
    expect(count('negative')).toBe(defaultConfig.probe_count.negative);
    expect(count('variants')).toBe(defaultConfig.probe_count.variants);
  });

  it('uses the configured model for the API call', async () => {
    const AnthropicMock = (await import('@anthropic-ai/sdk')).default as ReturnType<typeof vi.fn>;
    const instanceMock = AnthropicMock.mock.results[0]?.value;
    expect(instanceMock.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: defaultConfig.model }),
    );
  });

  it('strips markdown fences before parsing the JSON', async () => {
    const AnthropicMock = (await import('@anthropic-ai/sdk')).default as ReturnType<typeof vi.fn>;
    AnthropicMock.mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: '```json\n' + JSON.stringify({
              core: ['c'], adjacent: ['a'], negative: ['n'], variants: ['v'],
            }) + '\n```',
          }],
        }),
      },
    }));
    const { generateProbeMatrix } = await import('../../src/analyze/probe-generator.js');
    const matrix = await generateProbeMatrix(skill, defaultConfig, 'fake-key');
    expect(matrix.prompts.some(p => p.zone === 'core' && p.prompt === 'c')).toBe(true);
  });

  it('throws a clear error when the model returns non-JSON', async () => {
    const AnthropicMock = (await import('@anthropic-ai/sdk')).default as ReturnType<typeof vi.fn>;
    AnthropicMock.mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'sorry, no JSON here' }] }),
      },
    }));
    const { generateProbeMatrix } = await import('../../src/analyze/probe-generator.js');
    await expect(generateProbeMatrix(skill, defaultConfig, 'fake-key')).rejects.toThrow(
      'did not return valid JSON',
    );
  });
});
