import { describe, expect, it } from 'vitest';
import {
  buildSemanticSignature,
  classifyOperation,
  fingerprintResult,
  stableCanonicalize,
  toJsonValue,
} from '../../src/review/semantic-signature.js';

describe('semantic signatures', () => {
  it('distinguishes file ranges and normalizes read path aliases', () => {
    const first = buildSemanticSignature('Read', { file_path: '/repo/src/a.ts', offset: 1, limit: 20 }, { projectRoot: '/repo' });
    const alias = buildSemanticSignature('read_file', { path: '/repo/src/a.ts', offset: 1, limit: 20 }, { projectRoot: '/repo' });
    const otherRange = buildSemanticSignature('Read', { file_path: '/repo/src/a.ts', offset: 21, limit: 20 }, { projectRoot: '/repo' });

    expect(first.digest).toBe(alias.digest);
    expect(first.digest).not.toBe(otherRange.digest);
    expect(first.subject).toBe('./src/a.ts');
  });

  it('keeps search roots, globs, types, and case settings semantic', () => {
    const base = buildSemanticSignature('Grep', {
      pattern: 'TODO', path: 'src', glob: '*.ts', type: 'ts', case_sensitive: true,
    });
    const otherRoot = buildSemanticSignature('Grep', {
      pattern: 'TODO', path: 'tests', glob: '*.ts', type: 'ts', case_sensitive: true,
    });
    const otherCase = buildSemanticSignature('Grep', {
      pattern: 'TODO', path: 'src', glob: '*.ts', type: 'ts', case_sensitive: false,
    });

    expect(base.digest).not.toBe(otherRoot.digest);
    expect(base.digest).not.toBe(otherCase.digest);
  });

  it('sorts custom-object keys recursively while preserving arrays and types', () => {
    const a = buildSemanticSignature('lookup_widget', {
      z: [{ b: 2, a: 1 }], enabled: true, count: 1,
    });
    const b = buildSemanticSignature('lookup_widget', {
      count: 1, enabled: true, z: [{ a: 1, b: 2 }],
    });
    const reorderedArray = buildSemanticSignature('lookup_widget', {
      count: 1, enabled: true, z: [{ a: 1, b: 2 }, 0],
    });
    const stringCount = buildSemanticSignature('lookup_widget', {
      count: '1', enabled: true, z: [{ a: 1, b: 2 }],
    });

    expect(a.digest).toBe(b.digest);
    expect(a.digest).not.toBe(reorderedArray.digest);
    expect(a.digest).not.toBe(stringCount.digest);
  });

  it('keeps namespaced custom-tool identity in the signature', () => {
    const firstServer = buildSemanticSignature('alpha.search_items', { query: 'x' });
    const secondServer = buildSemanticSignature('beta.search_items', { query: 'x' });

    expect(firstServer.digest).not.toBe(secondServer.digest);
  });

  it('does not collapse quoted shell whitespace or execution context', () => {
    const quoted = buildSemanticSignature('Bash', { command: 'echo "a  b"', cwd: '/repo' });
    const collapsed = buildSemanticSignature('Bash', { command: 'echo "a b"', cwd: '/repo' });
    const otherCwd = buildSemanticSignature('Bash', { command: 'echo "a  b"', cwd: '/other' });

    expect(quoted.digest).not.toBe(collapsed.digest);
    expect(quoted.digest).not.toBe(otherCwd.digest);
  });

  it('handles hostile keys, circular values, controls, and large displays safely', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"text":"\\u001b[31mboom\\u0000"}') as Record<string, unknown>;
    const circular: Record<string, unknown> = { hostile };
    circular.self = circular;
    const signature = buildSemanticSignature(`read_file\u001b[2J${'x'.repeat(300)}`, circular);

    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(stableCanonicalize(hostile)).toContain('__proto__');
    expect(toJsonValue(circular)).toMatchObject({ self: { $circular: 'true' } });
    expect(signature.display).not.toContain('\u001b');
    expect(signature.display.length).toBeLessThanOrEqual(180);
  });

  it('classifies built-ins conservatively and uses explicit signature versions', () => {
    expect(classifyOperation('Write', { file_path: 'x' })).toEqual({ kind: 'mutation', confidence: 'high' });
    expect(classifyOperation('npm_wrapper', { command: 'npm test' })).toEqual({ kind: 'unknown', confidence: 'low' });
    expect(classifyOperation('Bash', { command: 'npm test' })).toEqual({ kind: 'verification', confidence: 'high' });
    expect(classifyOperation('mcp.search_items', {})).toEqual({ kind: 'read', confidence: 'medium' });
    expect(buildSemanticSignature('Read', { path: 'a' }).version).toBe('1');
  });

  it('fingerprints results with a stable, domain-separated digest', () => {
    expect(fingerprintResult('same')).toBe(fingerprintResult(Buffer.from('same')));
    expect(fingerprintResult('same')).not.toBe(fingerprintResult('different'));
    expect(fingerprintResult('same')).not.toBe(buildSemanticSignature('custom', 'same').digest);
  });
});
