<div align="center">

<img src="https://raw.githubusercontent.com/bharath31/tripwire/main/assets/banner.gif" alt="Tripwire behavioral tests for Agent Skills" width="100%" />

# Behavioral regression tests for Agent Skills

Catch skills that miss the right prompts or activate on the wrong ones. Run the tests locally, commit
the expected behavior, and gate every skill change in CI.

[![CI](https://github.com/bharath31/tripwire/actions/workflows/ci.yml/badge.svg)](https://github.com/bharath31/tripwire/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tripwire-skills)](https://www.npmjs.com/package/tripwire-skills)
[![tests](https://img.shields.io/badge/tests-311%20passing-61d990)](#development)
[![license](https://img.shields.io/badge/license-MIT-a2a3ad)](./LICENSE)

[Quick start](#quick-start) · [GitHub Action](#github-action) · [How it works](#how-it-works) ·
[Commands](#command-reference) · [Security](#security-model) ·
[Browser lint](https://tripwire.bharath.sh)

</div>

## Why Tripwire exists

An agent decides whether to load a skill from its name and description. That makes the description
routing code, not ordinary documentation.

Two costly failures are silent:

- A user asks for the intended outcome, but the skill never activates.
- An unrelated prompt activates the skill and injects the wrong instructions.

A schema linter cannot observe either failure. Tripwire runs real agent sessions, records the
activation event, and compares the result with an explicit behavioral contract.

Tripwire is useful when other people depend on your skill: a public skill, a shared company library,
or a repository where skill changes require review. A personal, low-stakes skill usually does not
need a behavioral test suite.

## Quick start

Tripwire requires Node.js 20 or newer.

```bash
npm install -g tripwire-skills
```

Start with the free static check:

```bash
tripwire lint ./skills/code-review
```

Run one real activation check with your existing agent CLI login:

```bash
tripwire test ./skills/code-review \
  --prompt "review this pull request for security problems" \
  --expect activate
```

This path does not need a separate prompt-generation API key. Once it works, generate and run a
broader activation matrix:

```bash
export ANTHROPIC_API_KEY=...
tripwire analyze ./skills/code-review
```

`analyze` writes `tripwire-scenarios.yaml` beside the skill. Review it like a test file:

```yaml
skillName: code-review
scenarios:
  - prompt: review this pull request for security problems
    zone: core
    expectedActivation: true

  - prompt: write release notes for this pull request
    zone: negative
    expectedActivation: false
```

Commit that file, then replay the same contract:

```bash
tripwire test ./skills/code-review
```

A missed activation, false trigger, agent timeout, or authentication failure returns a non-zero exit
code. Infrastructure failures are reported separately from behavioral regressions.

## The production workflow

1. Run `tripwire lint` while authoring a skill.
2. Run `tripwire analyze` to discover core, edge, negative, and paraphrased cases.
3. Review and commit `tripwire-scenarios.yaml`.
4. Run `tripwire test` in CI whenever the skill or its scenarios change.

This turns "the description looks right" into a reviewable contract with an executable gate.

## GitHub Action

The Action always lints changed skills. Set `probe: true` to replay committed activation scenarios:

```yaml
# .github/workflows/tripwire.yml
name: Tripwire
on: pull_request

jobs:
  skills:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: bharath31/tripwire@v1
        with:
          probe: true
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The Action annotates the diff, posts or updates one PR summary, and returns a failing check for lint
errors or probe failures. On forked pull requests without a key, it reports that the paid probe was
skipped and still runs static lint.

| Input | Default | Purpose |
|---|---|---|
| `paths` | `**/SKILL.md` | Comma or newline-separated skill globs |
| `probe` | `false` | Replay committed activation scenarios |
| `fail-on-warning` | `false` | Treat lint warnings as failures |
| `comment` | `true` | Post or update the PR summary |
| `claude-version` | `latest` | Claude Code version installed for the probe |
| `working-directory` | `.` | Repository root used to resolve skills |
| `anthropic-api-key` | unset | Probe credential; falls back to the environment |

## How it works

For each scenario, Tripwire:

1. Copies only the skill under test into a disposable agent workspace.
2. Runs the selected agent with a read-only or plan-mode permission boundary.
3. Reads the structured transcript for the skill activation signal.
4. Compares observed activation with `expectedActivation`.
5. Deletes the temporary workspace.

The Claude adapter watches the structured `Skill` tool-use event. This is stronger than asking
another model whether a description "looks likely" to activate.

Agent support is intentionally explicit:

| Agent | Activation signal | Status |
|---|---|---|
| Claude Code | Structured `Skill` tool-use event | Live-verified |
| Gemini CLI | Structured `activate_skill` tool-use event | Experimental; source-verified |
| Codex CLI | Read of the matching `skills/<name>/SKILL.md` path | Experimental; heuristic |

Use `--agent claude`, `--agent gemini`, or `--agent codex`. The default can also be set in
`tripwire.yaml`. Tripwire searches from the skill directory toward the repository root, so one file
can govern a whole skill library:

```yaml
agent: claude
model: claude-sonnet-4-6
judge_model: claude-haiku-4-5-20251001
probe_count:
  core: 8
  adjacent: 8
  negative: 8
  variants: 5
```

`analyze` currently uses Anthropic to generate the prompt matrix and judge activated sessions, even
when a different runtime adapter is selected. The selected agent CLI must also be installed and
authenticated. `test` replays committed prompts and does not regenerate them.

## Security model

- Probe sessions run in a disposable workspace containing only the `SKILL.md` under test.
- Claude and Gemini run in plan mode. Codex runs with a read-only sandbox.
- Tripwire does not host your repository or proxy agent sessions through a Tripwire backend.
- `analyze` sends the skill content to Anthropic to generate probe prompts and judge sessions.
- The GitHub Action uses credentials from your runner and does not print the API key.
- Adapter failures are not converted into false behavioral results.

Tripwire sends one anonymous event after a behavioral run so project DAU and reliability can be
measured. It contains the command, adapter, outcome, source, version, and a random hashed install or
repository ID. It never contains prompts, skill names, paths, repository names, outputs, usernames,
or credentials. Disable it with `TRIPWIRE_TELEMETRY=0`, `TRIPWIRE_TELEMETRY_DISABLED=1`, or
`DO_NOT_TRACK=1`. The full event contract is in [docs/analytics.md](./docs/analytics.md).

Please report vulnerabilities privately using the process in [SECURITY.md](./SECURITY.md).

## Command reference

| Command | What it does | Provider usage |
|---|---|---|
| `tripwire lint [path]` | Lint one skill or every skill under a directory | None |
| `tripwire lint [path] --fix` | Apply mechanically safe fixes | None |
| `tripwire analyze <skill>` | Generate prompts and run a real activation matrix | Yes |
| `tripwire test <skill> --prompt ... --expect ...` | Check one prompt without a scenario file | Yes |
| `tripwire test <skill>` | Replay a committed scenario file | Yes |
| `tripwire test-all <dir>` | Replay scenarios for a whole skill library | Yes |
| `tripwire conflicts <dir>` | Find duplicate names and description overlap | None |
| `tripwire eval <skill>` | Check post-activation assertions and optional rubrics | Depends on cases |
| `tripwire init [skill]` | Scaffold the pull-request workflow | None |
| `tripwire init --drift` | Add a scheduled model-drift workflow | None |

Run `tripwire <command> --help` for all options.

## What static lint checks

The built-in rules cover frontmatter shape, kebab-case names, trigger-focused descriptions, maximum
description length, placeholder text, body length, and the presence of an example. Rules can be
changed or extended with `tripwire.yaml`:

```yaml
extends: tripwire:recommended
rules:
  no-code-example: off
  description-use-when: warning
plugins:
  - ./org-rules.mjs
```

Static lint is also available at [tripwire.bharath.sh](https://tripwire.bharath.sh). It runs in the
browser and is useful for a quick authoring check. Behavioral activation testing requires the CLI
because it needs a real agent session.

## Additional checks

- `tripwire conflicts` flags duplicate skill names and likely description overlap.
- `tripwire test-all` reruns every committed contract to expose model drift.
- `tripwire eval` asserts response content after a skill activates.
- The coverage badge lints a public GitHub-hosted skill at request time:

```md
![tripwire](https://tripwire.bharath.sh/api/badge?repo=owner/repo&path=path/to/SKILL.md&branch=main)
```

These are secondary to the core workflow: define expected activation, run it against a real agent,
and fail the change when behavior diverges.

## Current maturity

Tripwire is pre-1.0. The static linter and Claude activation path have automated coverage and live
verification. Gemini and Codex activation checks remain experimental until their live canary suites
are published. Pin Tripwire and your agent CLI version in production workflows so upgrades are
intentional.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run build:action
npm run build:web
```

The test suite currently contains 338 tests across the CLI, Action, adapters, lint engine, evals,
drift checks, and browser functions. Pull requests run the suite on Node.js 20 and 22, rebuild the
browser bundle, audit production dependencies, verify the published package contents, and check the
committed Action bundle.

The site in `web/` and its Cloudflare Pages Functions in `functions/` deploy to
[tripwire.bharath.sh](https://tripwire.bharath.sh) from `main`.

## License

[MIT](./LICENSE)
