import { describe, it, expect } from 'vitest';
import { statusCopy, parseParams, buildCardHtml, buildBrandHtml } from '../../functions/_lib/og.js';

describe('statusCopy', () => {
  it('reports fail with error count when errors are present', () => {
    const v = statusCopy('fail', 2, 0);
    expect(v.icon).toBe('✗');
    expect(v.label).toContain('2 errors');
  });

  it('includes warning count alongside errors when both are present', () => {
    const v = statusCopy('fail', 1, 3);
    expect(v.label).toContain('1 error');
    expect(v.label).toContain('3 warnings');
  });

  it('reports warn when only warnings are present', () => {
    const v = statusCopy('warn', 0, 1);
    expect(v.icon).toBe('⚠');
    expect(v.label).toContain('1 warning');
  });

  it('reports pass with no counts in the label', () => {
    const v = statusCopy('pass', 0, 0);
    expect(v.icon).toBe('✓');
    expect(v.label).toBe('No issues found — passes every rule');
  });
});

describe('parseParams', () => {
  it('parses skill, status, errors, warnings from the query string and flags a real result', () => {
    const p = parseParams('https://tripwire.bharath.sh/api/og?skill=my-skill&status=fail&errors=2&warnings=1');
    expect(p).toEqual({ skill: 'my-skill', status: 'fail', errors: 2, warnings: 1, hasResult: true });
  });

  it('defaults to a brand card (hasResult false) with no params', () => {
    const p = parseParams('https://tripwire.bharath.sh/api/og');
    expect(p).toEqual({ skill: 'skill', status: 'pass', errors: 0, warnings: 0, hasResult: false });
  });

  it('falls back to pass for an unrecognized status value', () => {
    const p = parseParams('https://tripwire.bharath.sh/api/og?status=bogus');
    expect(p.status).toBe('pass');
    expect(p.hasResult).toBe(true);
  });

  it('truncates an overly long skill name', () => {
    const p = parseParams(`https://tripwire.bharath.sh/api/og?skill=${'a'.repeat(200)}`);
    expect(p.skill.length).toBe(60);
  });
});

describe('buildCardHtml', () => {
  it('builds an HTML string containing the skill name and verdict label', () => {
    const html = buildCardHtml('my-skill', 'fail', 2, 0);
    expect(typeof html).toBe('string');
    expect(html).toContain('my-skill');
    expect(html).toContain('2 errors');
    expect(html).toContain('display:flex');
  });

  it('escapes HTML-special characters in the skill name', () => {
    const html = buildCardHtml('<script>', 'pass', 0, 0);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('buildBrandHtml', () => {
  it('builds the branded landing-page card with the tagline', () => {
    const html = buildBrandHtml();
    expect(html).toContain('The quality gate for Agent Skills');
    expect(html).toContain('display:flex');
  });
});
