import { describe, it, expect } from 'vitest';
import {
  encodeShareState,
  decodeShareState,
  buildShareUrl,
  readShareStateFromHash,
  buildShareCardUrl,
  skillNameFrom,
} from '../../web/share.js';

describe('encodeShareState / decodeShareState', () => {
  it('round-trips plain ASCII', () => {
    const raw = '---\nname: foo\ndescription: Use when testing\n---\nbody text';
    expect(decodeShareState(encodeShareState(raw))).toBe(raw);
  });

  it('round-trips unicode content', () => {
    const raw = 'description: emoji test 🪤 and non-ascii café';
    expect(decodeShareState(encodeShareState(raw))).toBe(raw);
  });

  it('produces a URL-safe string with no base64 padding characters', () => {
    const encoded = encodeShareState('some skill content here');
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe('buildShareUrl / readShareStateFromHash', () => {
  it('builds a hash link that reads back the original content', () => {
    const raw = 'name: my-skill\ndescription: Use when doing X';
    const url = buildShareUrl(raw, 'https://tripwire.bharath.sh/');
    expect(url.startsWith('https://tripwire.bharath.sh/#s=')).toBe(true);

    const hash = url.slice(url.indexOf('#'));
    expect(readShareStateFromHash(hash)).toBe(raw);
  });

  it('returns null when the hash has no share param', () => {
    expect(readShareStateFromHash('#checks')).toBeNull();
    expect(readShareStateFromHash('')).toBeNull();
  });

  it('returns null rather than throwing on a corrupt payload', () => {
    expect(readShareStateFromHash('#s=%%%not-valid-base64%%%')).toBeNull();
  });
});

describe('skillNameFrom', () => {
  it('extracts the name when it is the first line of frontmatter', () => {
    const raw = '---\nname: my-helper\ndescription: Use when doing X\n---\nbody';
    expect(skillNameFrom(raw)).toBe('my-helper');
  });

  it('extracts the name when it appears after other frontmatter fields', () => {
    const raw = '---\ndescription: Use when doing X\nname: my-helper\n---\nbody';
    expect(skillNameFrom(raw)).toBe('my-helper');
  });

  it('strips surrounding quotes', () => {
    const raw = '---\nname: "my-helper"\n---\nbody';
    expect(skillNameFrom(raw)).toBe('my-helper');
  });

  it('falls back to "skill" when there is no frontmatter', () => {
    expect(skillNameFrom('just some body text')).toBe('skill');
  });

  it('falls back to "skill" when frontmatter has no name field', () => {
    const raw = '---\ndescription: Use when doing X\n---\nbody';
    expect(skillNameFrom(raw)).toBe('skill');
  });
});

describe('buildShareCardUrl', () => {
  it('encodes a passing report as status=pass', () => {
    const url = buildShareCardUrl(
      { skillName: 'brainstorming', errors: [], warnings: [] },
      'https://tripwire.bharath.sh',
    );
    expect(url).toBe('https://tripwire.bharath.sh/api/og?skill=brainstorming&status=pass&errors=0&warnings=0');
  });

  it('encodes a failing report as status=fail even when warnings are also present', () => {
    const url = buildShareCardUrl(
      { skillName: 'my-skill', errors: [{}], warnings: [{}, {}] },
      'https://tripwire.bharath.sh',
    );
    expect(url).toContain('status=fail');
    expect(url).toContain('errors=1');
    expect(url).toContain('warnings=2');
  });

  it('encodes a warning-only report as status=warn', () => {
    const url = buildShareCardUrl(
      { skillName: 'my-skill', errors: [], warnings: [{}] },
      'https://tripwire.bharath.sh',
    );
    expect(url).toContain('status=warn');
  });
});
