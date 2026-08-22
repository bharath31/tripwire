import { describe, expect, it } from 'vitest';
import { renderBadgeSvg, validGitHubSource } from '@/lib/badge';

describe('badge safety', () => {
  it('accepts a normal GitHub skill path', () => {
    expect(validGitHubSource('acme/skills', 'skills/review/SKILL.md', 'main')).toBe(true);
  });

  it('rejects traversal and malformed repositories', () => {
    expect(validGitHubSource('acme/skills', '../secret', 'main')).toBe(false);
    expect(validGitHubSource('https://example.com', 'SKILL.md', 'main')).toBe(false);
  });

  it('escapes text in the SVG', () => {
    expect(renderBadgeSvg('<x>', 'passing', '#000')).not.toContain('<x>');
  });
});
