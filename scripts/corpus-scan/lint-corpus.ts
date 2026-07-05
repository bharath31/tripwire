#!/usr/bin/env node
// Runs the free `lint()` engine across every SKILL.md fetched by fetch.ts and
// writes an aggregate summary — no API key, no cost, safe to run at any scale.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lintRaw, summarize, renderMarkdownReport, type CorpusEntry } from './aggregate.js';

function parseArgs(argv: string[]): { dir: string } {
  const dirFlag = argv.find((a) => a.startsWith('--dir='));
  return { dir: dirFlag ? dirFlag.split('=')[1] : join(process.cwd(), 'scripts', 'corpus-scan', 'corpus') };
}

async function main(): Promise<void> {
  const { dir } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(join(dir, '_manifest.json'), 'utf-8')) as Array<{ file: string; repo: string; url: string }>;

  const entries: CorpusEntry[] = [];
  for (const m of manifest) {
    const raw = await readFile(join(dir, m.file), 'utf-8');
    const result = lintRaw(raw, m.file);
    entries.push({ file: m.file, repo: m.repo, url: m.url, result });
  }

  const summary = summarize(entries);
  const report = renderMarkdownReport(summary);

  await writeFile(join(dir, '_summary.json'), JSON.stringify({ summary, entries }, null, 2), 'utf-8');
  await writeFile(join(dir, '_report.md'), report, 'utf-8');

  console.log(report);
  console.log(`\nWrote ${join(dir, '_summary.json')} and ${join(dir, '_report.md')}`);
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
