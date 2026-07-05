#!/usr/bin/env node
// Pulls a sample of real, public SKILL.md files from GitHub via `gh search code`
// and saves them locally for the free lint pass. Read-only, no writes to GitHub,
// no cost beyond GitHub API rate limits. See scripts/corpus-scan/README.md.

import { execa } from 'execa';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface SearchHit {
  path: string;
  repository: { nameWithOwner: string; isFork: boolean; isPrivate: boolean };
  url: string;
}

export function parseArgs(argv: string[]): { limit: number; outDir: string } {
  const limitFlag = argv.find((a) => a.startsWith('--limit='));
  const outFlag = argv.find((a) => a.startsWith('--out='));
  return {
    limit: limitFlag ? Number.parseInt(limitFlag.split('=')[1], 10) : 100,
    outDir: outFlag ? outFlag.split('=')[1] : join(process.cwd(), 'scripts', 'corpus-scan', 'corpus'),
  };
}

export function rawUrlFor(hit: SearchHit): string {
  // hit.url looks like https://github.com/<owner>/<repo>/blob/<sha>/<path>
  const match = hit.url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`Unrecognized GitHub blob URL: ${hit.url}`);
  const [, owner, repo, sha, path] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path}`;
}

export function safeFileName(nameWithOwner: string, index: number): string {
  return `${index.toString().padStart(4, '0')}-${nameWithOwner.replace(/\//g, '__')}.md`;
}

async function searchSkillFiles(limit: number): Promise<SearchHit[]> {
  const { stdout } = await execa('gh', [
    'search', 'code',
    '--filename', 'SKILL.md',
    '-L', String(limit),
    '--json', 'path,repository,url',
  ]);
  const hits = JSON.parse(stdout) as SearchHit[];
  return hits.filter((h) => !h.repository.isFork && !h.repository.isPrivate);
}

async function main(): Promise<void> {
  const { limit, outDir } = parseArgs(process.argv.slice(2));
  await mkdir(outDir, { recursive: true });

  console.log(`Searching GitHub for up to ${limit} public SKILL.md files...`);
  const hits = await searchSkillFiles(limit);
  console.log(`Found ${hits.length} candidates (forks/private excluded).`);

  const manifest: Array<{ file: string; repo: string; url: string; sourceUrl: string }> = [];
  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const rawUrl = rawUrlFor(hit);
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      const fileName = safeFileName(hit.repository.nameWithOwner, i);
      await writeFile(join(outDir, fileName), content, 'utf-8');
      manifest.push({ file: fileName, repo: hit.repository.nameWithOwner, url: hit.url, sourceUrl: rawUrl });
      fetched++;
    } catch (err) {
      failed++;
      console.log(`  skip ${hit.repository.nameWithOwner}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await writeFile(join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\nFetched ${fetched} file(s), ${failed} failed. Manifest: ${join(outDir, '_manifest.json')}`);
  console.log(`Next: npx tsx scripts/corpus-scan/lint-corpus.ts --dir=${outDir}`);
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
