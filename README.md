<div align="center">

<img src="https://raw.githubusercontent.com/bharath31/tripwire/main/assets/banner.gif" alt="Tripwire — the quality gate for Agent Skills" width="100%" />

<br />

**Does your skill trip on the right prompts?**

Lint, real activation-coverage probing, and CI checks for the `SKILL.md` files that power Agent Skills.

<p>
  <a href="https://tripwire.bharath.sh"><img src="https://tripwire.bharath.sh/api/badge?repo=bharath31/tripwire&amp;path=skills/tripwire/SKILL.md&amp;branch=main" alt="tripwire coverage" /></a>
  <a href="https://tripwire.bharath.sh"><img src="https://img.shields.io/badge/playground-tripwire.bharath.sh-ff4d4d" alt="Playground" /></a>
  <img src="https://img.shields.io/badge/tests-288%20passing-4ade80" alt="Tests" />
  <img src="https://img.shields.io/badge/Agent%20Skills-SKILL.md-8b8d9a" alt="Agent Skills" />
</p>

<p>
  <a href="#quick-start">Quick start</a> ·
  <a href="#the-github-action">GitHub Action</a> ·
  <a href="#command-reference">Commands</a> ·
  <a href="#going-deeper">Going deeper</a> ·
  <a href="./ROADMAP.md">Roadmap</a> ·
  <a href="https://tripwire.bharath.sh">Try it in your browser ↗</a>
</p>

</div>

---

## The idea

A skill's `description` is the only signal the agent uses to decide whether to invoke it. It isn't
documentation — it's routing logic, and it fails **silently in both directions**: too narrow and the
skill never fires on its own use cases; too broad and it hijacks unrelated prompts. You can't lint
your way to knowing which happens — that's a behavioral property, so you have to *run* the skill.

Tripwire does exactly that. It lints your `SKILL.md` against best-practice rules, then probes
**activation coverage** by generating a prompt matrix and running real agent sessions to see what
actually fires — surfacing description bugs, coverage gaps, and false positives before they ship.

> **When you don't need this:** if a skill is purely personal — you're the only one who'll ever load
> it — you'll notice a misfire the next time you use it. Tripwire earns its keep once a skill ships
> to *other people's* agents, where a silent gap is invisible until someone reports "it just didn't
> do the thing."

## Quick start

```bash
npm install -g tripwire-skills
```

```bash
# Zero-config entry — scaffolds .github/workflows/tripwire.yml and lints your skill
tripwire init ./skills/brainstorming/

# Static best-practice lint (instant, offline, free)
tripwire lint ./skills/brainstorming/SKILL.md

# Probe which prompts actually activate it, then commit the scenarios it writes
tripwire analyze ./skills/brainstorming/

# In CI: rerun those exact scenarios deterministically, no re-probing
tripwire test ./skills/brainstorming/
```

Prefer not to install anything? The lint engine runs live in your browser at
**[tripwire.bharath.sh](https://tripwire.bharath.sh)** — paste a `SKILL.md` and see it graded instantly.

## The GitHub Action

Gate skill changes in CI the same way you gate lint and tests. Add one workflow file:

```yaml
# .github/workflows/tripwire.yml
name: Tripwire
on: pull_request
jobs:
  skills:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write   # for the summary comment
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0       # needed to diff the PR
      - uses: bharath31/tripwire@v1
        with:
          probe: true                                       # also run coverage checks
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}  # your key, your runner
```

On every PR it **lints changed skills** (always), **probes activation coverage** (when a key and
committed scenarios are present), annotates the exact lines on the diff, and posts a sticky summary
comment. The probe runs in **your** CI using **your** API key — it never leaves your runner. Without a
key (e.g. fork PRs), the probe skips with a notice and lint still gates the PR.

<details>
<summary><strong>Action inputs</strong></summary>

| Input | Default | Description |
|---|---|---|
| `paths` | `**/SKILL.md` | Comma/newline-separated globs for skill files |
| `probe` | `false` | Run the activation coverage probe (needs a key) |
| `fail-on-warning` | `false` | Treat lint warnings as check failures |
| `comment` | `true` | Post/update a sticky PR summary comment |
| `claude-version` | `latest` | `@anthropic-ai/claude-code` version for the probe |
| `working-directory` | `.` | Root to resolve skills and run the probe from |
| `anthropic-api-key` | — | API key for the probe; falls back to `ANTHROPIC_API_KEY` in the env |

</details>

## Command reference

| Command | What it does | Cost |
|---|---|---|
| `tripwire init [skill]` | Scaffold the Action workflow (and lint + guide you to `analyze`) | Free, instant |
| `tripwire lint <skill>` | Static rules check on a skill file (`--fix` for safe auto-fixes) | Free, instant |
| `tripwire analyze <skill>` | Prompt matrix → real agent sessions → coverage map | ~$0.10–0.50/run |
| `tripwire test <skill>` | Rerun committed scenarios (CI mode) | Cheaper than `analyze` |
| `tripwire conflicts <dir>` | Scan a skills directory for name collisions & description overlap | Free, instant |
| `tripwire test-all <dir>` | Rerun committed scenarios for every skill — the drift check | Like `test`, per skill |
| `tripwire eval <skill>` | Outcome-quality evals: assertions + an optional rubric judge | Free + rubric cases per case |

`analyze` is a deliberate local step (it calls real models). It writes a `tripwire-scenarios.yaml` you
commit alongside the skill; the Action and `tripwire test` then rerun those exact scenarios
deterministically.

## Going deeper

<details>
<summary><strong>Cross-agent probing</strong> — does your skill fire in every agent you ship to?</summary>

<br />

`analyze` and `test` accept `--agent <claude|gemini|codex>` (default `claude`) to probe activation
against a different agent CLI on the same `SKILL.md`. Confidence differs by agent:

| Agent | Detection | Confidence |
|---|---|---|
| `claude` (Claude Code) | dedicated `Skill` tool-use event in `stream-json` | verified against a live install |
| `gemini` (Gemini CLI) | dedicated `activate_skill` tool-use event | high — confirmed from source, not yet live-verified |
| `codex` (Codex CLI) | heuristic: a file-read command matching a `skills/<name>/SKILL.md` path (Codex has no dedicated skill event) | lower confidence, not yet live-verified |

```bash
tripwire analyze ./skills/brainstorming/ --agent=gemini
```

</details>

<details>
<summary><strong>Skill-set conflicts</strong> — skills that quietly fight each other</summary>

<br />

Two skills can each lint clean and still collide at runtime. `tripwire conflicts` scans a whole
directory and reports **name collisions** (two files sharing a `name` — a hard error) and
**description overlap** (two skills sharing enough trigger vocabulary that a prompt could plausibly
fire either — an advisory warning).

```bash
tripwire conflicts ./skills/
#   → --threshold 0.0-1.0 tunes how much shared vocabulary counts as overlap (default 0.3)
```

Static and free — no API key. A behavioral probe (does an ambiguous prompt pick the *wrong* skill)
is a natural next step on top of this.

</details>

<details>
<summary><strong>Model drift</strong> — scenarios that pass today can regress silently</summary>

<br />

A `tripwire-scenarios.yaml` committed in March isn't guaranteed to still pass in June — model updates
can shift which prompts activate a skill with no code change to explain it. `tripwire test-all` reruns
every skill's committed scenarios in one pass and reports any that now disagree with their baseline:

```bash
tripwire test-all ./skills/
```

`tripwire init --drift` scaffolds a scheduled workflow (`.github/workflows/tripwire-drift.yml`, weekly)
that runs this on a timer, writes the report to `$GITHUB_STEP_SUMMARY`, and fails the run when a skill
has drifted — the same signal GitHub already uses to notify you of scheduled-workflow failures.

</details>

<details>
<summary><strong>Outcome evals</strong> — did it <em>work</em>, not just did it fire</summary>

<br />

Everything above answers "did the skill activate." `tripwire eval` answers "once activated, did it do
the right thing," with author-written cases in `tripwire-evals.yaml`:

```yaml
skillName: brainstorming
cases:
  - name: asks a clarifying question before proposing a solution
    prompt: help me build a new dashboard feature
    assertions:
      - type: contains
        value: "?"
      - type: not_contains
        value: "```"
    rubric: The response should ask about scope or requirements before writing any code.
```

Each case runs two independent checks: **assertions** (`contains` / `not_contains` — free,
deterministic, no key) and an optional **`rubric`** (a natural-language bar, graded by an LLM judge,
priced like `analyze`). A rubric case is *skipped with a clear notice* — never silently ignored — when
no `ANTHROPIC_API_KEY` is set; assertion-only cases still run.

```bash
tripwire eval ./skills/brainstorming/
```

This is the newest, least-established surface here — assertions are solid, but a rubric is only as
good as the rubric you write.

</details>

<details>
<summary><strong>Custom rules &amp; org config</strong> — turn rules off, change severity, add your own</summary>

<br />

For a team standardizing skills across an org, drop this in the same `tripwire.yaml` the probe config
uses (resolved per-skill-directory):

```yaml
extends: tripwire:recommended   # the only preset today — every built-in rule at its default level
rules:
  no-code-example: off          # off | warning | error — explicit rules always win over a preset
  description-use-when: warning
plugins:
  - ./org-rules.mjs             # plain JS, resolved relative to this tripwire.yaml
```

A plugin exports plain objects — no dependency on tripwire's own types:

```js
// org-rules.mjs
export const rules = [
  {
    id: 'org-requires-owner',
    defaultLevel: 'error',
    check: (skill) => (skill.frontmatter.owner ? null : 'org policy: every skill needs an `owner` field'),
  },
];
```

A malformed custom rule is skipped with a warning rather than crashing the run. This applies
everywhere `lint()` runs: `tripwire lint`, `analyze`, `test`, `test-all`, and the Action.

</details>

## What it checks

**Lint (static, free):** `name` present and kebab-case · `description` present, starts with
`"Use when"`, ≤ 1024 chars, and doesn't summarize a workflow · body isn't a stub (no placeholder text,
has an example, meets a length floor).

**Coverage probe (real sessions):** generates prompts across four zones and checks what actually fires —

| Zone | Should activate? | Catches |
|---|---|---|
| Core triggers | ✅ yes | the skill missing its own use case |
| Adjacent / edge | ✅ yes | gaps the author didn't think to test |
| Negative | ❌ no | false positives (fires when it shouldn't) |
| Keyword variants | ✅ yes | description keyword blind spots |

A scenario whose real behavior disagrees with its expectation is a **regression** — a gap (didn't fire
when it should) or a false positive (fired when it shouldn't).

## Coverage badge

A live badge — no stored state; it fetches your `SKILL.md` from GitHub and lints it fresh on every
request (cached ~5 min at the edge):

```md
![tripwire](https://tripwire.bharath.sh/api/badge?repo=owner/repo&path=path/to/SKILL.md&branch=main)
```

`repo` is required (`owner/repo`); `path` defaults to `SKILL.md` at the repo root; `branch` defaults to
`main`. An unrecognized repo renders a grey "unknown" badge rather than failing — a badge should never
break your README's render. (The one at the top of this file points tripwire at its own skill.)

## Also ships as

- **A skill** — copy [`skills/tripwire/SKILL.md`](./skills/tripwire/SKILL.md) into your own
  `.claude/skills/` and the agent lints every `SKILL.md` you write *as you author it*, recommending
  the CLI and the Action at the right moments (never spending API money without asking).
- **A VS Code extension** (early scaffold) — [`vscode-extension/`](./vscode-extension) wires the same
  lint engine to inline squiggles. It builds, type-checks, and packages into a real `.vsix`, but isn't
  published to the Marketplace yet.

## How it works

Activation isn't visible in `claude -p` text output — Tripwire runs
`claude -p "<prompt>" --output-format stream-json --verbose` and detects the `Skill` tool-use event for
the skill under test. In CI, each changed skill is staged at `.claude/skills/<name>/SKILL.md` so the
agent can load and activate it.

## Development

```bash
npm install
npm test              # run the suite (288 tests)
npm run build         # build the CLI (dist/cli.js)
npm run build:action  # bundle the GitHub Action (action-dist/index.js)
npm run build:web     # bundle the browser playground
```

The landing page (`web/`) and its Cloudflare Pages Functions (`functions/`) auto-deploy to
[tripwire.bharath.sh](https://tripwire.bharath.sh) on push to `main`. The README banner is a Remotion
composition in [`banner/`](./banner) — `cd banner && npx remotion render Banner out/banner.gif --codec=gif`
regenerates [`assets/banner.gif`](./assets/banner.gif).
