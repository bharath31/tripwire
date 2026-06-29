# 🪤 Tripwire

**Does your skill trip on the right prompts?**

Tripwire lints **Agent Skills** — the `SKILL.md` files that extend coding agents — and probes their **activation coverage**, surfacing description bugs, coverage gaps, and false positives before they ship. It's a CLI, a GitHub Action, and an in-browser playground over one engine. (Activation probing runs through the [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI today.)

A skill's `description` is the signal Claude uses to decide whether to invoke it. Get it wrong and the skill silently never fires — or fires on the wrong prompts. Tripwire catches both.

▶️ **Try the linter in your browser:** [tripwire.bharath.sh](https://tripwire.bharath.sh)

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
npm install -g tripwire
```

| Command | What it does | Cost |
|---|---|---|
| `tripwire lint <skill>` | Static rules check on a skill file | Free, instant |
| `tripwire analyze <skill>` | Generate a prompt matrix → run real Claude sessions → coverage map | ~$0.10–0.50/run |
| `tripwire test <skill>` | Rerun committed scenarios (CI mode) | Cheaper than analyze |

```bash
# Lint a skill (frontmatter + body checks)
tripwire lint ./skills/brainstorming/SKILL.md

# Probe which prompts actually activate it, then commit the scenarios
tripwire analyze ./skills/brainstorming/
#   → writes tripwire-scenarios.yaml next to the skill

# In CI: rerun those scenarios without re-probing
tripwire test ./skills/brainstorming/
```

`analyze` is a deliberate local step (it calls real models). It writes a `tripwire-scenarios.yaml` you commit alongside the skill; the Action and `tripwire test` then rerun those exact scenarios deterministically.

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
