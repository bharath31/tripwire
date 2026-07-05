import { describe, it, expect } from 'vitest';
import { statusCopy, parseParams, buildCard } from '../../web/api/og.js';

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
  it('parses skill, status, errors, warnings from the query string', () => {
    const p = parseParams('https://tripwire.bharath.sh/api/og?skill=my-skill&status=fail&errors=2&warnings=1');
    expect(p).toEqual({ skill: 'my-skill', status: 'fail', errors: 2, warnings: 1 });
  });

  it('defaults to a pass card with no params', () => {
    const p = parseParams('https://tripwire.bharath.sh/api/og');
    expect(p).toEqual({ skill: 'skill', status: 'pass', errors: 0, warnings: 0 });
  });

  it('falls back to pass for an unrecognized status value', () => {
    const p = parseParams('https://tripwire.bharath.sh/api/og?status=bogus');
    expect(p.status).toBe('pass');
  });

  it('truncates an overly long skill name', () => {
    const p = parseParams(`https://tripwire.bharath.sh/api/og?skill=${'a'.repeat(200)}`);
    expect(p.skill.length).toBe(60);
  });
});

describe('buildCard', () => {
  it('builds a satori-shaped element tree rooted at a div', () => {
    const card = buildCard('my-skill', 'pass', 0, 0);
    expect(card.type).toBe('div');
    expect(Array.isArray(card.props.children)).toBe(true);
  });
});
