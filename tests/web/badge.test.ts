import { describe, it, expect } from 'vitest';
import { lintRaw, badgeMessage, renderBadgeSvg } from '../../web/api/badge.js';

describe('lintRaw', () => {
  it('lints raw fetched markdown content directly', () => {
    const raw = '---\nname: my-skill\ndescription: Use when doing X\n---\n\nSome real body content with a `code` example that is long enough to clear the word floor for this rule pretty easily honestly.\n';
    expect(lintRaw(raw).errors).toEqual([]);
  });
});

describe('badgeMessage', () => {
  it('reports error count and fail color when errors are present', () => {
    const msg = badgeMessage({ errors: [{ level: 'error', rule: 'x', message: 'x' }], warnings: [] });
    expect(msg).toEqual({ message: '1 error', color: '#ff4d4d' });
  });

  it('reports warning count and warn color when only warnings are present', () => {
    const msg = badgeMessage({ errors: [], warnings: [{ level: 'warning', rule: 'x', message: 'x' }, { level: 'warning', rule: 'y', message: 'y' }] });
    expect(msg).toEqual({ message: '2 warnings', color: '#fbbf24' });
  });

  it('reports "passing" and pass color when clean', () => {
    const msg = badgeMessage({ errors: [], warnings: [] });
    expect(msg).toEqual({ message: 'passing', color: '#4ade80' });
  });
});

describe('renderBadgeSvg', () => {
  it('renders a valid SVG containing the label and message text', () => {
    const svg = renderBadgeSvg('tripwire', 'passing', '#4ade80');
    expect(svg).toContain('<svg');
    expect(svg).toContain('>tripwire<');
    expect(svg).toContain('>passing<');
    expect(svg).toContain('#4ade80');
  });

  it('escapes special characters in label and message', () => {
    const svg = renderBadgeSvg('a&b', '<script>', '#000');
    expect(svg).toContain('a&amp;b');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });
});
