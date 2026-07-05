# Hosted dashboard — architecture design (not built)

**Status: design only. No infrastructure exists for this. Do not build against this doc without
re-checking the gate below first.**

## Why this doc exists, and why nothing is running

Every other piece of tripwire (CLI, GitHub Action, playground, VS Code extension) is stateless —
zero-infra by design, so the roadmap doesn't spend engineering time or money on backend
infrastructure before there's a real reason to. A hosted dashboard breaks that pattern: it needs
a database, an auth system, and an ongoing hosting bill. That's a real commitment, not a weekend
build, so it's gated:

**Build this only once tripwire has ≥25 repos running the Action weekly, or ≥3 design partners
explicitly ask for cross-repo visibility.** Before that point, every repo already gets its own
signal — PR comments, CI status, the drift-check step summary. A dashboard's only value-add is
*aggregating across repos*, which only matters once there are enough repos to aggregate.

If you're reading this because that gate has been hit: good, this doc is a starting sketch, not
a spec — validate the shape against whatever the actual design partners asked for before building
any of it literally.

## What problem it would solve

The CLI/Action/playground each answer "is *this* skill healthy?" A dashboard would answer "is
our *fleet* of skills healthy?" — org-wide coverage trends, which skills are drifting, which
teams' skills are lagging on lint compliance, a leaderboard view for a marketplace. None of that
is answerable today without manually collecting PR comments across repos.

## Proposed shape (sketch, not committed)

**Hosting:** Next.js on Vercel — matches the existing stack (the playground's `/api/og` and
`/api/badge` are already Vercel Edge Functions; bharath-site is Next.js on Vercel). Avoids
introducing a second hosting provider for one project.

**Auth:** GitHub OAuth. The whole product is scoped to GitHub repos already (the Action reads
from a GitHub checkout, `tripwire.yaml` lives in a GitHub repo) — reusing GitHub identity avoids
a second account system, and repo-scoped OAuth tokens double as the authorization boundary (a
user only sees dashboards for repos they can access on GitHub).

**Data ingestion — the actual design question.** Two options, not yet chosen:
1. **Push model:** the Action, when a `dashboard-token` input is set, POSTs its report (the same
   `SkillReport[]` shape `src/action/report.ts` already builds) to a dashboard ingestion
   endpoint after each run. Simple, real-time, but requires every repo to opt in via a new Action
   input and a token to manage.
2. **Pull model:** the dashboard backend polls repos' commit history for `tripwire-scenarios.yaml`
   changes and `tripwire.yaml` config, reconstructing history without any Action changes. No
   per-repo opt-in step, but can't show real CI-run results, only what's committed — misses
   PR-time lint failures that never got merged.

Push is probably right for a v1 (it's the data that's actually valuable — real CI outcomes, not
just committed state) — but this is exactly the kind of call to validate against what design
partners actually want to see, not decide in the abstract here.

**Data model (rough):**
- `repos` — id, github repo id, owner, connected_by (user), created_at
- `skill_reports` — repo_id, skill_name, file_path, commit_sha, lint_errors, lint_warnings,
  probe_gaps, probe_false_positives, ran_at
- `users` — github id, oauth token (encrypted at rest)

**What v1 would show:** a repo list with current lint/coverage status per skill, a history
sparkline per skill (coverage over time — this is the thing nothing else today provides), and an
org-wide rollup if the design-partner ask is at the org level rather than per-repo.

## Explicitly out of scope for v1

- Billing/pricing — free while validating; a paid tier is a separate decision after usage exists.
- Real-time websocket updates — polling/refresh-on-load is enough for a v1.
- Anything beyond GitHub — no GitLab/Bitbucket until GitHub usage alone justifies it.
- Replacing the CLI/Action/playground — this sits on top of them, doesn't change how any of them
  work standalone. A repo with no dashboard connection still gets full value from tripwire.

## Before building any of this

1. Re-confirm the gate (25 weekly-active repos or 3 explicit asks) is actually met — check
   `bat-os/brain/projects/tripwire.md` for the current measured state.
2. Talk to whoever asked for it about the push-vs-pull ingestion question above — that's the one
   design decision here with real tradeoffs, and it should be answered by an actual use case, not
   guessed at.
3. Treat this doc as a first draft to react to, not a spec to implement literally.
