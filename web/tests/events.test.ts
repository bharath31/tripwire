import { describe, expect, it } from 'vitest';
import { validEventPayload } from '@/lib/events';

const valid = {
  event: 'behavioral_run_completed',
  installation_id: 'a'.repeat(32),
  command: 'test',
  agent: 'claude',
  outcome: 'pass',
  source: 'cli',
  version: '0.1.3',
};

describe('event allowlist', () => {
  it('accepts the documented payload even when unknown fields are present', () => {
    expect(validEventPayload({ ...valid, prompt: 'must never be stored' })).toBe(true);
  });

  it('rejects raw machine identifiers and invalid outcomes', () => {
    expect(validEventPayload({ ...valid, installation_id: 'bharaths-macbook' })).toBe(false);
    expect(validEventPayload({ ...valid, outcome: 'clicked' })).toBe(false);
  });
});
