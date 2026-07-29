# Tripwire launch operating plan

## Goal

Reach 100 behavioral DAU: 100 distinct anonymous installs or repositories completing a valid
`analyze`, `test`, `test-all`, or Action probe on the same UTC day.

Page views, npm downloads, stars, and lint-only runs are leading indicators. They do not count as
active product use.

## The adoption model

The sustainable target is:

- 600 repositories with committed scenarios and the Action enabled;
- 15% of those repositories running a behavioral check on an average day: 90 DAU;
- 100 weekly local CLI users, with 10% active on an average day: 10 DAU.

The checkpoints are 25 DAU by day 7, 60 DAU by day 21, and 100 DAU by day 45. If new installs are
high but valid behavioral runs are low, fix onboarding before adding distribution.

## One conversion path

Every launch asset points to the same workflow:

```bash
npm install -g tripwire-skills
tripwire lint ./skills/my-skill
tripwire test ./skills/my-skill --prompt "your real user prompt" --expect activate
```

The first activation milestone is a valid one-prompt behavioral result. The adoption milestone is a
generated or authored `tripwire-scenarios.yaml`. The retained-use milestone is a second behavioral
run within seven days, ideally from the GitHub Action.

## Launch sequence

### Release day

1. Merge the release PR.
2. Publish npm `0.1.2`.
3. Move the GitHub Action `v1` tag to the release commit.
4. Confirm the source-controlled `PRODUCT_ANALYTICS` Analytics Engine binding is active after the site deploy.
5. Verify npm install, the two-prompt Claude canary, the Action on a fixture PR, and the DAU event.
6. Publish the announcement below on GitHub, X, LinkedIn, Hacker News, and relevant skill-developer
   communities.

### Days 1 to 7

- Personally onboard 20 maintainers of public skill repositories.
- Offer to add the scenario file and Action in a small pull request.
- Record every install-to-first-probe failure.
- Publish one concrete silent-miss teardown with the prompt, activation event, and fix.
- Report DAU, activation rate, infrastructure-error rate, and first 7-day returns daily.

### Days 8 to 30

- Publish three more real skill teardowns.
- Add Tripwire to Agent Skill directories and GitHub Action discovery surfaces.
- Ask activated maintainers for one sentence describing the failure Tripwire caught.
- Turn repeated onboarding failures into product fixes.
- Contact another 10 maintainers each week until 100 repositories retain.

## Launch announcement

**Title:** Your SKILL.md can pass lint and still never activate

An Agent Skill can be perfectly valid and still miss the prompt it was built for. The failure is
silent: the agent gives a generic answer and the user becomes the test harness.

Tripwire treats a skill description as routing code. It runs real agent sessions against positive,
negative, edge, and paraphrased prompts, observes the skill activation event, and exports the result
as a scenario file you can gate in CI.

```bash
npm install -g tripwire-skills
tripwire analyze ./skills/my-skill
tripwire test ./skills/my-skill
```

It is MIT licensed, runs with your agent credentials, and stages each probe in a disposable
read-only workspace. Claude Code is live-verified. Gemini and Codex adapters are still experimental.

Source and quickstart: https://github.com/bharath31/tripwire

## Daily dashboard

| Funnel stage | Metric | Action if weak |
|---|---|---|
| Reach | High-intent landing visits | Improve distribution |
| Install | npm installs from launch traffic | Tighten value proof and quickstart |
| Activation | First valid behavioral run | Remove auth, cost, or setup friction |
| Adoption | Scenario file committed and Action enabled | Improve post-run guidance |
| Retention | Second valid run within seven days | Make CI and drift checks habitual |
| Reliability | Infrastructure-error rate | Fix adapters before adding traffic |

The Analytics Engine query and privacy contract are in [docs/analytics.md](./docs/analytics.md).
