# Corpus scan — "State of Agent Skills"

Tooling behind the `idea-2026-07-03-state-of-agent-skills` post brief: pull a sample of real,
public `SKILL.md` files and publish aggregate lint/activation numbers instead of a handful of
cherry-picked anecdotes.

Two clearly separate stages — **free lint** (safe to run at any scale) and **paid activation
probe** (spends real `ANTHROPIC_API_KEY` money, requires explicit confirmation, bounded sample).

## 1. Fetch (free — GitHub API only)

```bash
npx tsx scripts/corpus-scan/fetch.ts --limit=100 --out=scripts/corpus-scan/corpus
```

Uses `gh search code --filename SKILL.md` (requires `gh auth login`), excludes forks and private
repos, downloads each file's raw content, and writes a `_manifest.json` alongside the files.
GitHub's code-search API has its own rate limits — for a large sample (500-1000), expect this to
take a while and possibly need reruns.

## 2. Lint the corpus (free — no API key, no cost)

```bash
npx tsx scripts/corpus-scan/lint-corpus.ts --dir=scripts/corpus-scan/corpus
```

Runs the exact same `lint()` engine the CLI and Action use, across every fetched file. Writes
`_summary.json` (raw data) and `_report.md` (the markdown table for the post) into the corpus
directory.

## 3. Activation sample (PAID — requires explicit confirmation)

```bash
ANTHROPIC_API_KEY=... npx tsx scripts/corpus-scan/analyze-sample.ts --sample-size=20 --confirm-spend
```

Runs the real `tripwire analyze` probe (real Claude sessions) against a bounded subset of the
corpus. Prints a cost estimate ($0.10-0.50/skill per the CLI's own pricing) before running and
**refuses to run without `--confirm-spend`**. Keep `--sample-size` small first — this is what
funds the "X% of skills have an activation gap or false positive" half of the post; the lint
numbers alone (step 2) don't need it.

## Publishing

Don't publish per-repo call-outs — the brief in
`bat-os/queue/inbox/idea-2026-07-03-state-of-agent-skills.md` is explicit: frame this as a
category-wide blind spot, not a public callout of specific authors. `worstOffenders` in
`_summary.json` is for picking anonymized or credited-with-permission examples, not a shame list.
