import { describe, expect, it } from 'vitest';
import { buildInlineScenario } from '../../src/test/inline-scenario.js';

describe('buildInlineScenario', () => {
  it('creates an explicit positive contract', () => {
    expect(buildInlineScenario('review this pull request', 'activate')).toEqual({
      prompt: 'review this pull request',
      zone: 'core',
      expectedActivation: true,
    });
  });

  it('creates an explicit negative contract', () => {
    expect(buildInlineScenario('write release notes', 'quiet')).toEqual({
      prompt: 'write release notes',
      zone: 'negative',
      expectedActivation: false,
    });
  });

  it('requires an expectation so a result cannot be interpreted implicitly', () => {
    expect(() => buildInlineScenario('review this', undefined)).toThrow(
      '--expect must be either "activate" or "quiet"',
    );
  });

  it('rejects an empty prompt', () => {
    expect(() => buildInlineScenario('   ', 'activate')).toThrow('--prompt must not be empty');
  });
});
