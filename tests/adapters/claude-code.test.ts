import { describe, expect, it } from 'vitest';
import { claudeFailureReason } from '../../src/adapters/claude-code.js';

describe('claudeFailureReason', () => {
  it('extracts a user-facing error from a failed stream result', () => {
    const output = [
      JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } }),
      JSON.stringify({
        type: 'result',
        is_error: true,
        result: "You've hit your session limit",
      }),
    ].join('\n');
    expect(claudeFailureReason(output)).toBe("You've hit your session limit");
  });

  it('does not expose arbitrary transcript text as an infrastructure reason', () => {
    expect(claudeFailureReason('plain model output')).toBeUndefined();
  });
});
