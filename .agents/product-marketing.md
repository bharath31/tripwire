# Product Marketing Context

*Last updated: 2026-07-29*

## Product Overview

**One-liner:** Tripwire catches Agent Skills that silently fail to activate—or activate on the wrong prompts—before users encounter the failure.

**What it does:** Tripwire lints `SKILL.md` files, generates an activation test matrix, runs real agent sessions, and turns the results into replayable regression scenarios. Its CLI and GitHub Action let skill developers block a change when a skill stops routing correctly; secondary tools cover conflicts, model drift, and output-quality evals.

**Product category:** Behavioral testing and CI for Agent Skills.

**Product type:** Open-source developer tool: npm CLI, GitHub Action, browser playground, and an early editor extension.

**Business model:** Free and MIT-licensed today. Users supply their own model credentials and run probes locally or in their own CI. A paid model is unvalidated; possible future value lies in hosted history, team policy, fleet-wide monitoring, or managed test execution.

## Target Audience

**Target companies:** Teams, open-source maintainers, agencies, and agent-platform developers that publish reusable Agent Skills to people outside the author’s immediate environment.

**Decision-makers:** Individual skill developer for adoption; developer-experience or agent-platform lead for team standardization; engineering manager for CI policy.

**Primary use case:** Prevent a published skill from silently missing intended prompts or hijacking unrelated prompts after a description, agent, or model change.

**Jobs to be done:**

- Tell me whether my skill actually activates for the intents I claim to support.
- Turn observed activation behavior into a repeatable regression contract.
- Give reviewers a trustworthy pass/fail signal on every skill change.
- Detect activation drift when the underlying agent changes without a code change.

**Use cases:**

- Validate a new `SKILL.md` before publishing it to users.
- Review a pull request that changes a skill description.
- Test one skill across supported agent CLIs.
- Re-run a committed scenario suite after a model or agent update.
- Find overlapping skills that may compete for the same prompt.

## Personas

| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Skill developer | Shipping a skill that users can reliably invoke | Activation is implicit and failures are silent | See exactly which real prompts activate or miss before publishing |
| Skill-library maintainer | Consistency across many contributed skills | Manual review cannot verify runtime routing behavior | Enforce one reviewable activation contract in CI |
| Agent platform / DevEx lead | Reliable internal agent behavior | Model and agent updates create unexplained regressions | Re-run the skill fleet and surface drift |
| Engineering manager | Low-friction quality gates and controlled spend | LLM tests can be flaky, slow, and expensive | Fixed scenarios, explicit budgets, and clear infrastructure-versus-behavior failures |

## Problems & Pain Points

**Core problem:** A `SKILL.md` can be syntactically valid and still never activate for the prompts its author expects. It can also activate too broadly and interfere with unrelated work. Both failures are behavioral and usually remain invisible until a user reports that “it just didn’t do the thing.”

**Why alternatives fall short:**

- Reading the description checks wording, not real routing behavior.
- Static linters can catch malformed files but cannot observe activation.
- Manually trying a few obvious prompts misses paraphrases, negative cases, and later model drift.
- Generic prompt-eval tools grade outputs but usually do not observe the agent’s skill-activation event.
- Waiting for user reports makes the user the test harness.

**What it costs them:** Broken releases, support and debugging time, reduced trust in the skill library, and reluctance to rely on skills for production workflows.

**Emotional tension:** “The file looks right, but I have no proof the agent will actually use it.” Maintainers worry that a green static check gives false confidence.

## Competitive Landscape

**Direct:** No validated direct competitor has been recorded yet. Research is required before making “only tool” or category-leader claims.

**Secondary:** Generic prompt/eval platforms can test final outputs but require custom harnesses to observe skill activation and often assume an application API rather than an agent CLI.

**Secondary:** Static `SKILL.md` linters are faster and free but cannot test runtime routing.

**Indirect:** Manual prompt testing and contributor review have no durable scenario contract and are difficult to repeat across models or agents.

## Differentiation

**Key differentiators:**

- Observes real skill activation rather than inferring quality from text alone.
- Tests positive, negative, and paraphrased user intents.
- Exports reviewable scenarios that can be committed beside the skill.
- Runs locally and in the user’s own CI with the user’s own credentials.
- Can track drift across agent/model changes.

**How we do it differently:** Treat a skill description as routing code and its prompt set as a behavioral test suite.

**Why that’s better:** It converts an implicit, silent behavior into a visible contract a team can review and gate.

**Why customers choose us:** They publish skills to other people and cannot rely on personal observation to notice failures.

## Objections

| Objection | Response |
|-----------|----------|
| “I can try a few prompts myself.” | Manual checks do not create a replayable contract and rarely cover negative cases, paraphrases, or later drift. |
| “LLM tests are flaky.” | Tripwire must distinguish infrastructure failures, allow repeated samples and explicit thresholds, and report confidence rather than pretending every run is deterministic. |
| “I don’t want to expose an API key or repository.” | Probes run locally or on the user’s own CI runner; the product must document and enforce least-privilege agent execution. |
| “This costs money and slows CI.” | Static lint stays free; generated suites need budgets, concurrency controls, selective PR execution, and a fast smoke-test profile. |
| “My skill is only for me.” | Tripwire is probably unnecessary; the author will notice a misfire during normal use. |

**Anti-persona:** A solo developer with one private, rarely changed skill and no need to publish, review, or support it for other users.

## Switching Dynamics

**Push:** A user reports that a published skill does not activate; a skill hijacks unrelated requests; a model update changes behavior; reviewers cannot validate routing from a diff.

**Pull:** A concrete coverage report, a committed regression suite, and a PR check that explains exactly which user intent regressed.

**Habit:** Authors read the description, try one happy-path prompt, and ship. Teams treat `SKILL.md` as documentation rather than executable routing logic.

**Anxiety:** Probe cost, nondeterminism, CI duration, credential safety, agent-version compatibility, and false confidence from an unreliable gate.

## Customer Language

**How they describe the problem:**

- “It just didn’t do the thing.”
- “The skill works when I invoke it explicitly, but users don’t know the magic words.”
- “This description looks fine. How do I know the agent will actually pick it?”
- “It worked last month and now it doesn’t.”

**How they describe us:**

- “Behavioral tests for `SKILL.md`.”
- “A CI gate for skill activation.”
- “Catch silent skill misfires before users do.”

**Words to use:** activate, miss, false trigger, silent failure, real agent session, regression, prompt coverage, routing, production skill, user intent.

**Words to avoid:** “everything you need,” “deterministic” for model behavior, “works everywhere,” “AI-powered,” “best practice” without evidence, and broad claims about all agents.

**Glossary:**

| Term | Meaning |
|------|---------|
| Agent Skill | A reusable instruction package whose entry point is a `SKILL.md` file |
| Activation | The agent selects and loads a skill for a user prompt |
| Gap | A prompt expected to activate the skill does not |
| False trigger | A prompt expected to stay outside the skill activates it |
| Scenario | A prompt plus an explicit activation expectation |
| Drift | Activation behavior changes across agent or model versions |

## Brand Voice

**Tone:** Direct, technically credible, candid about limitations.

**Style:** Developer-first, concrete, terse, and evidence-led. Show the prompt, observed activation event, and resulting verdict.

**Personality:** Sharp, trustworthy, pragmatic, opinionated, transparent.

## Proof Points

**Metrics:**

- 342 automated tests pass after a build as of 2026-07-29.
- The full npm dependency tree has no reported audit vulnerabilities as of 2026-07-29.
- The live site, npm `0.1.3` release candidate, and GitHub Action `v1` are release-aligned in source.
- Market validation is still minimal: 2 GitHub stars, 14 unique repository clones in the 14 days ending 2026-07-28, and 11 npm downloads in the seven days ending 2026-07-28.

**Customers:** No validated customer logos recorded.

**Testimonials:** No customer testimonials recorded. Do not fabricate or imply adoption.

**Value themes:**

| Theme | Proof |
|-------|-------|
| Real activation, not static guesses | Claude adapter parses the structured skill tool-use event |
| Reviewable regression contract | `analyze` exports a scenario file committed beside the skill |
| Runs in the user’s environment | CLI and composite GitHub Action use the user’s runner and credentials |
| Transparent limitations | Unverified adapters and early surfaces are documented in the repository |

## Goals

**Business goal:** Reach at least 100 daily active skill developers after launch and retain them by making Tripwire the default production check for published Agent Skills.

**Conversion action:** A developer successfully tests a real skill, commits a scenario suite, and enables the GitHub Action.

**North-star activation event:** A unique installation or repository completes at least one real activation scenario run with a valid behavioral verdict.

**Daily active user definition:** A privacy-preserving unique installation that successfully runs `analyze`, `test`, `test-all`, or an Action probe on a given UTC day. Static landing-page visits and lint-only playground use do not count as active product use.

**Retention definition:** An activated installation or repository completes a behavioral run again within 7 days.

**Launch target:** At least 100 DAU, with at least 40% of new activated repositories returning for a second behavioral run within 7 days. This retention target is an initial operating hypothesis and should be revised from real cohorts.

**Current metrics:** Behavioral DAU instrumentation is live on the production D1 event store. The first production query on 2026-07-29 recorded 0 real behavioral DAU before launch outreach. Public signals are 2 GitHub stars, 14 unique repository clones over the preceding 14 days, and 11 npm downloads in the preceding seven days.
