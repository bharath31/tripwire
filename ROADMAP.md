# Roadmap

Tripwire's bet: **static lint on `SKILL.md` is table stakes; activation testing is the part
nobody else does.** A skill's `description` is the only signal an agent uses to decide whether
to invoke it — and that's a behavioral property, not a syntax property. You can't lint your way
to knowing whether a skill actually fires. You have to run it.

So the roadmap optimizes for one thing: **make activation testing as normal in a skill's CI as
lint and unit tests already are.** Everything below either grows the wedge (skills that get
tested) or grows trust in the wedge (accuracy, cross-agent coverage, drift detection).

If you only write skills for your own agent, you probably don't need this — you'll notice a
misfire the next time you use it. Tripwire is for skills you ship to *other people's* agents,
where a silent misfire is invisible until a user reports "it just didn't do the thing."

## Now

- [x] Fix the install story — the CLI publishes as `tripwire-skills` on npm (`npm install -g
      tripwire` used to install an unrelated package; the bin command stays `tripwire`). Also
      caught and fixed a deeper bug: the built `dist/` was gitignored and never actually being
      published, so the old package name would have installed a binary that didn't exist either
      way — fixed with an explicit `files` allowlist and a `prepublishOnly` build step.
- [x] Usage measurement on the playground (Cloudflare Web Analytics — the site is hosted on
      Cloudflare Pages) — flip the toggle in the Cloudflare dashboard and the beacon auto-injects;
      no snippet needed in the page. Until that toggle is on, no traffic data flows.
- [x] Shareable coverage reports from the playground (a `#s=` deep link plus an `/api/og`
      share-card image endpoint).
- [x] `tripwire init` — scaffold the workflow file, lint immediately, and optionally seed
      `tripwire-scenarios.yaml` in one command via `--analyze`.

## Next

- [x] A public scan of activation coverage across a large sample of real, published skills —
      published as data, not a pitch. Every gap it finds is a bug report to the author.
      (`scripts/corpus-scan/` — the free lint half is built and verified against live GitHub
      data; the paid activation-probe half is built and gated behind explicit confirmation.)
- [x] Tripwire, shipped as a skill itself (`skills/tripwire/`) — so it lints and probes your
      `SKILL.md` while you're still authoring it, before you ever touch CI.
- [x] `--fix` for the lint rules that are mechanically fixable — deliberately narrow: only
      `name-kebab-case` is safe to auto-rewrite without changing what a skill claims to do.
- [x] Coverage badges for READMEs — a live `/api/badge` endpoint that lints your `SKILL.md`
      fresh on every request, no stored state.

## Later

- [x] Cross-agent activation testing (`tripwire analyze --agent=gemini|codex`). Gemini CLI has
      a dedicated skill-invocation event, matched with high confidence; Codex CLI doesn't expose
      one, so detection there is a documented heuristic, not a structured-field match — neither
      has been verified against a live install yet, only against the two projects' own source.
- [x] Skill-set conflict detection (`tripwire conflicts <dir>`) — static, free: name collisions
      (hard error) and description-vocabulary overlap (advisory). A real behavioral probe — does
      an ambiguous prompt actually pick the wrong skill among a competing set — is a natural
      next step on top of this, not yet built.
- [x] Scheduled re-probing (`tripwire test-all` + `tripwire init --drift`) — reruns every
      committed `tripwire-scenarios.yaml` on a weekly schedule and fails loudly (with a
      `$GITHUB_STEP_SUMMARY` report) when a skill's activation behavior has drifted since it was
      last committed, without waiting for a PR to surface it.
- [x] Pluggable custom rules, with a shareable `recommended` config (`extends` / `rules` /
      `plugins` in `tripwire.yaml`) — the lint engine is now a rule registry, not a monolithic
      function, so teams can turn rules off, change severity, or add their own org-specific
      checks as plain JS files. Applies everywhere `lint()` runs, including the Action.
- [x] Outcome evals (`tripwire eval`) — did the skill's *output* meet the bar, not just "did it
      fire." Author-written `tripwire-evals.yaml`: free deterministic assertions plus an optional
      LLM-judge rubric per case. This is the newest, least-proven surface here — assertions are
      solid, but rubric grading is only as good as the rubric, and it's the one place tripwire
      now overlaps with what official skill-authoring tooling also does. Built because it was
      asked for directly; still worth watching whether it earns its keep versus the rest.
- [x] VS Code extension scaffold (squiggles at author time, `vscode-extension/`) — build-only:
      it's type-checked, bundles with esbuild, and packages into a real `.vsix` locally, but
      hasn't been run inside a live VS Code window or published to the Marketplace yet.

## Not now

- **A hosted dashboard.** The CLI, the Action, and the playground already cover local, CI, and
  browser. A hosted product is only worth building once there's a clear signal it's needed —
  not by default. A design sketch exists (`docs/hosted-dashboard.md`) for when that gate is hit
  (≥25 weekly-active repos, or explicit design-partner asks) — it's a starting point to react to,
  not a build queued up.
- **Matching every community skill-linter on rule count.** Static lint is a commodity; we'd
  rather be right about activation than exhaustive about syntax.

---

Have a use case this doesn't cover, or found a skill that tripwire got wrong? Open an issue —
this roadmap moves on real usage, not on this list.
