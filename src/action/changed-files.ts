import { execFileSync } from 'node:child_process';

export function globToRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i++; // consume second *
        if (pattern[i + 1] === '/') {
          // **/ matches zero or more full path segments (never a bare filename prefix)
          re += '(?:.*/)?';
          i++; // consume the slash
        } else {
          // ** not followed by / matches anything including slashes
          re += '.*';
        }
      } else {
        re += '[^/]*'; // * matches within a segment
      }
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function parsePatterns(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function filterByPatterns(files: string[], patterns: string[]): string[] {
  const regexes = patterns.map(globToRegExp);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const file of files) {
    if (!seen.has(file) && regexes.some((re) => re.test(file))) {
      seen.add(file);
      out.push(file);
    }
  }
  return out;
}

export function getChangedSkillFiles(
  base: string,
  head: string,
  patterns: string[],
  cwd: string = process.cwd(),
): string[] {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${base}...${head}`],
    { cwd, encoding: 'utf-8' },
  );
  const files = out.split('\n').map((f) => f.trim()).filter(Boolean);
  return filterByPatterns(files, patterns);
}
