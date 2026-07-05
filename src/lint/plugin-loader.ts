import { pathToFileURL } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import type { Rule } from './rule-types.js';

function isValidRule(x: unknown): x is Rule {
  if (!x || typeof x !== 'object') return false;
  const r = x as Partial<Rule>;
  return (
    typeof r.id === 'string' &&
    (r.defaultLevel === 'error' || r.defaultLevel === 'warning') &&
    typeof r.check === 'function'
  );
}

/**
 * Dynamically imports a user-authored custom-rule file (plain JS, no
 * dependency on tripwire's own types needed — just matching shape) and
 * returns whatever valid `Rule` objects it exports, either as a `rules`
 * named export or the module's default export. Malformed entries are
 * skipped with a console warning rather than crashing the whole lint run —
 * one broken custom rule shouldn't take every other rule down with it.
 */
export async function loadCustomRules(filePath: string, baseDir: string = process.cwd()): Promise<Rule[]> {
  const absPath = isAbsolute(filePath) ? filePath : resolve(baseDir, filePath);
  const mod = await import(pathToFileURL(absPath).href);

  const exported = mod.rules ?? mod.default ?? [];
  const candidates: unknown[] = Array.isArray(exported) ? exported : [exported];

  const rules: Rule[] = [];
  for (const c of candidates) {
    if (isValidRule(c)) {
      rules.push(c);
    } else {
      console.warn(`tripwire: skipping invalid custom rule in ${filePath} (expected { id, defaultLevel, check })`);
    }
  }
  return rules;
}
