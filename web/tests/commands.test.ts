import { describe, expect, it } from 'vitest';
import {
  buildGitHubWorkflowUrl,
  buildTestCommand,
  parseGitHubRepository,
  shellQuote,
} from '@/lib/commands';

describe('command builder', () => {
  it('quotes POSIX paths and prompts without allowing command interpolation', () => {
    const command = buildTestCommand({
      agent: 'claude',
      path: "./skills/team's-review",
      prompt: 'review $(touch /tmp/not-allowed) and `whoami`',
      expectation: 'activate',
      shell: 'posix',
    });
    expect(command).toContain("'./skills/team'\"'\"'s-review'");
    expect(command).toContain("'review $(touch /tmp/not-allowed) and `whoami`'");
  });

  it('escapes PowerShell apostrophes', () => {
    expect(shellQuote("developer's prompt", 'powershell')).toBe("'developer''s prompt'");
  });
});

describe('GitHub workflow handoff', () => {
  it.each([
    ['https://github.com/acme/skills', { owner: 'acme', name: 'skills' }],
    ['git@github.com:acme/skills.git', { owner: 'acme', name: 'skills' }],
    ['acme/skills', { owner: 'acme', name: 'skills' }],
  ])('parses %s', (input, expected) => {
    expect(parseGitHubRepository(input)).toEqual(expected);
  });

  it('rejects non-GitHub URLs', () => {
    expect(parseGitHubRepository('https://example.com/acme/skills')).toBeNull();
  });

  it('builds a review-before-commit GitHub URL', () => {
    const url = buildGitHubWorkflowUrl({ owner: 'acme', name: 'skills' }, 'main');
    expect(url).toContain('https://github.com/acme/skills/new/main?');
    const params = new URL(url).searchParams;
    expect(params.get('filename')).toBe('.github/workflows/tripwire.yml');
    expect(params.get('value')).toContain('uses: bharath31/tripwire@v1');
  });
});
