# Changelog

All notable changes to Tripwire are documented here.

## 0.1.2

### Behavioral trust

- Added explicit `expectedActivation` values to generated and replayed scenarios.
- Separated agent, authentication, timeout, and CLI failures from behavioral regressions.
- Moved CLI and GitHub Action probes into disposable agent-specific workspaces.
- Restricted Claude and Gemini probes to plan mode and Codex probes to a read-only sandbox.
- Made `tripwire.yaml` agent selection effective across behavioral commands.
- Added schema validation for committed scenario files.
- Made CLI behavioral gates fail on static lint errors.
- Made scenario-only pull requests trigger the sibling skill in the GitHub Action.
- Made nested skills inherit repository-level configuration and reject malformed cost settings.
- Added bounded concurrency for agent sessions and judge calls.

### Product experience

- Rebuilt the landing page around the silent activation-regression use case.
- Added a one-prompt behavioral test path that works with an existing agent CLI login.
- Added a production workflow, safety model, maturity statement, MIT license, and security policy.
- Added anonymous, documented behavioral DAU measurement with standard opt-out controls.
- Upgraded the test toolchain and removed all reported npm dependency advisories.

### Verification

- Added CI across Node.js 20 and 22.
- Expanded the suite to 340 tests.
- Added committed Action-bundle verification and npm package-content checks.

## 0.1.1

- Added the initial npm CLI, GitHub Action, browser lint playground, activation probes, drift checks,
  conflict detection, and response evals.
