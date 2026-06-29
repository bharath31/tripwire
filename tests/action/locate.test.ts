import { describe, it, expect } from 'vitest';
import { locateFinding } from '../../src/action/locate.js';
import type { LintError } from '../../src/types.js';

const SKILL = `---
name: MyHelper
description: This helper does stuff. Step 1 is to set up.
---

## Notes

TODO: write this properly.

Run the thing.`;

function err(rule: string): LintError {
  return { level: 'error', rule, message: 'x' };
}

describe('locateFinding', () => {
  it('points name rules at the name: line', () => {
    expect(locateFinding(SKILL, err('name-kebab-case'))).toBe(2);
  });

  it('points description rules at the description: line', () => {
    expect(locateFinding(SKILL, err('description-use-when'))).toBe(3);
    expect(locateFinding(SKILL, err('description-no-workflow'))).toBe(3);
  });

  it('points no-placeholders at the placeholder line', () => {
    // "TODO: write this properly." is line 8
    expect(locateFinding(SKILL, { level: 'warning', rule: 'no-placeholders', message: 'TODO' })).toBe(8);
  });

  it('falls back to line 1 when nothing specific is found', () => {
    const noFrontmatter = 'just a body with no markers';
    expect(locateFinding(noFrontmatter, err('name-present'))).toBe(1);
  });

  it('points body-too-short at the first non-empty body line', () => {
    // first body content line after the closing --- is "## Notes" (line 6)
    expect(locateFinding(SKILL, { level: 'warning', rule: 'body-too-short', message: 'x' })).toBe(6);
  });
});
