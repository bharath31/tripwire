# 🪤 Tripwire

**Does your skill trip on the right prompts?**

Tripwire lints **Agent Skills** — the `SKILL.md` files that extend coding agents — and probes their **activation coverage**, surfacing description bugs, coverage gaps, and false positives before they ship. It's a CLI, a GitHub Action, and an in-browser playground over one engine. (Activation probing runs through the [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI today.)

A skill's `description` is the signal Claude uses to decide whether to invoke it. Get it wrong and the skill silently never fires — or fires on the wrong prompts. Tripwire catches both.

▶️ **Try the linter in your browser:** [tripwire.bharath.sh](https://tripwire.bharath.sh)

---

## Use it as a skill (lint while you author)

Copy [`skills/tripwire/SKILL.md`](./skills/tripwire/SKILL.md) into your own `.claude/skills/`
and Claude will lint every `SKILL.md` you write or edit as you go, instead of waiting for CI to
catch it. It recommends the CLI, `tripwire analyze`, and `tripwire init` at the right moments —
it doesn't spend API money on your behalf without asking first.

## VS Code extension (build-only scaffold)

[`vscode-extension/`](./vscode-extension) has the same lint engine wired up as inline squiggles.
It's built, type-checked, and packages into a real `.vsix` locally — see its own README for how
to build and try it. It has **not** been published to the Marketplace and has not yet been run
inside a live VS Code window; treat it as an early scaffold, not a finished extension.

---

## The GitHub Action (run it on every PR)

Catch skill regressions in CI the same way you catch lint and test failures. Add one workflow file:

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

On every PR it **lints changed skills** (always), **probes activation coverage** (when a key and committed scenarios are present), annotates the exact lines on the diff, and posts a sticky summary comment. The probe runs in **your** CI using **your** API key — it never leaves your runner.

### Action inputs

| Input | Default | Description |
|---|---|---|
| `paths` | `**/SKILL.md` | Comma/newline-separated globs for skill files |
| `probe` | `false` | Run the activation coverage probe (needs a key) |
| `fail-on-warning` | `false` | Treat lint warnings as check failures |
| `comment` | `true` | Post/update a sticky PR summary comment |
| `claude-version` | `latest` | `@anthropic-ai/claude-code` version for the probe |
| `working-directory` | `.` | Root to resolve skills and run the probe from |
| `anthropic-api-key` | — | API key for the probe; falls back to `ANTHROPIC_API_KEY` in the env |

Without a key (e.g. PRs from forks), the probe **skips with a notice** — lint still runs and gates the PR.

---

## The CLI

```bash
npm install -g tripwire-skills
```

| Command | What it does | Cost |
|---|---|---|
| `tripwire init [skill]` | Scaffold the Action workflow (and lint + guide you to `analyze`) | Free, instant |
| `tripwire lint <skill>` | Static rules check on a skill file | Free, instant |
| `tripwire analyze <skill>` | Generate a prompt matrix → run real Claude sessions → coverage map | ~$0.10–0.50/run |
| `tripwire test <skill>` | Rerun committed scenarios (CI mode) | Cheaper than analyze |
| `tripwire conflicts <dir>` | Scan a whole skills directory for name collisions and description overlap | Free, instant |
| `tripwire test-all <dir>` | Rerun committed scenarios for every skill in a directory — the drift check | Like `test`, per skill |
| `tripwire eval <skill>` | Outcome-quality evals: assertions + an optional rubric judge — did it *work*? | Free (assertions) + rubric cases cost like `analyze`, per case |

```bash
# Zero-config entry: writes .github/workflows/tripwire.yml and lints your skill
tripwire init ./skills/brainstorming/
#   → pass --analyze to also run a real probe and seed tripwire-scenarios.yaml in one go

# Lint a skill (frontmatter + body checks)
tripwire lint ./skills/brainstorming/SKILL.md

# Auto-fix what's mechanically safe to fix (currently: non-kebab-case names only —
# wording/content rules need human or LLM judgment, so they're left for you to fix)
tripwire lint --fix ./skills/brainstorming/SKILL.md

# Probe which prompts actually activate it, then commit the scenarios
tripwire analyze ./skills/brainstorming/
#   → writes tripwire-scenarios.yaml next to the skill

# In CI: rerun those scenarios without re-probing
tripwire test ./skills/brainstorming/
```

`analyze` is a deliberate local step (it calls real models). It writes a `tripwire-scenarios.yaml` you commit alongside the skill; the Action and `tripwire test` then rerun those exact scenarios deterministically.

### Cross-agent probing

`analyze` and `test` both accept `--agent <claude|gemini|codex>` (default `claude`) to probe
activation against a different agent CLI on the same `SKILL.md`. Confidence differs by agent:

| Agent | Detection | Confidence |
|---|---|---|
| `claude` (Claude Code) | dedicated `Skill` tool-use event in `stream-json` output | verified against a live install |
| `gemini` (Gemini CLI) | dedicated `activate_skill` tool-use event in `stream-json` output | high — confirmed from source, not yet verified against a live install |
| `codex` (Codex CLI) | heuristic: pattern-matches a file-read command against a `skills/<name>/SKILL.md` path — Codex has no dedicated skill event as of this writing | lower confidence, not yet verified against a live install |

```bash
tripwire analyze ./skills/brainstorming/ --agent=gemini
```

### Custom rules & org config

For a single skill you author for yourself, the built-in rules are the whole story. For a team
standardizing skills across an org, you'll usually want to turn a rule off, change its severity,
or add your own. Drop this in the same `tripwire.yaml` the probe config already lives in
(resolved per-skill-directory, same as the probe config):

```yaml
extends: tripwire:recommended   # the only preset today — every built-in rule at its default level
rules:
  no-code-example: off          # off | warning | error — explicit rules always win over a preset
  description-use-when: warning
plugins:
  - ./org-rules.mjs             # path to a plain JS file, resolved relative to this tripwire.yaml
```

A plugin file exports plain objects — no dependency on tripwire's own types needed:

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

A malformed custom rule is skipped with a warning rather than crashing the whole lint run — one
broken rule doesn't take every other rule down with it. This applies everywhere `lint()` runs:
`tripwire lint`, `analyze`, `test`, `test-all`, and the Action.

### Skill-set conflicts

If you have more than one skill, `tripwire lint` checking each file in isolation isn't enough —
two skills can each be individually well-formed and still fight each other at runtime. `tripwire
conflicts` scans a whole directory and reports:

- **Name collisions** — two `SKILL.md` files sharing the same `name` (a hard error; names must
  be unique).
- **Description overlap** — two skills whose descriptions share enough trigger vocabulary that a
  real prompt could plausibly activate either one (an advisory warning — some overlap is often
  fine once you read both skills' bodies, but worth a look).

```bash
tripwire conflicts ./skills/
#   → pass --threshold 0.0-1.0 to tune how much shared vocabulary counts as overlap (default 0.3)
```

This is static and free — no API key, no real agent sessions. A future version may add a real
behavioral probe (does an ambiguous prompt actually pick the *wrong* skill) on top of this.

### Model drift

A `tripwire-scenarios.yaml` committed in March isn't guaranteed to still pass in June — model
updates can silently shift which prompts activate a skill, with no code change on your side to
explain it. `tripwire test-all` reruns every skill's committed scenarios in one pass and reports
any that now disagree with their recorded baseline:

```bash
tripwire test-all ./skills/
```

`tripwire init --drift` scaffolds a scheduled workflow (`.github/workflows/tripwire-drift.yml`,
weekly by default) that runs this on a timer and fails the run — and, on `$GITHUB_STEP_SUMMARY`-
capable runners, writes the drift report straight into the run summary — the same signal GitHub
already uses to notify you of scheduled-workflow failures.

### Outcome evals — did it *work*, not just did it fire

Everything above answers "did the skill activate on the right prompts." None of it answers
"once activated, did the skill actually do the right thing." `tripwire eval` closes that gap
with author-written test cases in `tripwire-evals.yaml`, next to the skill:

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

Each case runs two independent checks:

- **Assertions** (`contains` / `not_contains`) — free, deterministic substring checks against the
  transcript. No API key needed.
- **`rubric`** (optional) — a natural-language description of what "good" looks like, graded by
  an LLM judge (same cost profile as `analyze`, per case). Skipped with a clear notice — not
  silently ignored — when no `ANTHROPIC_API_KEY` is set; assertion-only cases still run.

```bash
tripwire eval ./skills/brainstorming/
#   → --agent, --judge-model, and --evals <file> all work the same as on analyze/test
```

This is the newest, least-established part of tripwire — assertions are solid and free, but the
rubric judge is only as good as the rubric you write, same as any LLM-judge eval.

---

## What it checks

**Lint (static, free):**
- `name` present and kebab-case
- `description` present, starts with `"Use when"`, ≤ 1024 chars, and doesn't summarize a workflow
- body isn't a stub (no placeholder text, has an example, meets a length floor)

**Coverage probe (real sessions):** generates prompts across four zones and checks what actually fires —

| Zone | Should activate? | Catches |
|---|---|---|
| Core triggers | ✅ yes | the skill missing its own use case |
| Adjacent / edge | ✅ yes | gaps the author didn't think to test |
| Negative | ❌ no | false positives (fires when it shouldn't) |
| Keyword variants | ✅ yes | description keyword blind spots |

A scenario whose real behavior disagrees with its expectation is a **regression** — a gap (didn't fire when it should) or a false positive (fired when it shouldn't).

---

## Badges

A live badge — no stored state, it fetches your `SKILL.md` from GitHub and lints it fresh on
every request (cached ~5 minutes at the edge):

```md
![tripwire](https://tripwire.bharath.sh/api/badge?repo=owner/repo&path=path/to/SKILL.md&branch=main)
```

`repo` is required (`owner/repo`); `path` defaults to `SKILL.md` at the repo root; `branch`
defaults to `main`. An unrecognized repo or path renders a grey "unknown" badge rather than
failing — a badge should never break your README's render.

---

## How it works

Activation isn't visible in `claude -p` text output — Tripwire runs `claude -p "<prompt>" --output-format stream-json --verbose` and detects the `Skill` tool-use event for the skill under test. In CI, each changed skill is staged at `.claude/skills/<name>/SKILL.md` so Claude can load and activate it.

## Development

```bash
npm install
npm test            # run the suite
npm run build       # build the CLI (dist/cli.js)
npm run build:action  # bundle the GitHub Action (action-dist/index.js)
npm run build:web   # bundle the browser playground
```
