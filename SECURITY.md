# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Email `bharath31@users.noreply.github.com` with:

- the affected Tripwire version or commit;
- the smallest reproduction you can provide;
- the impact you observed or expect;
- any suggested mitigation.

Do not include live API keys, repository secrets, or other credentials. You should receive an
acknowledgement within seven days. A fix and disclosure timeline will depend on severity and whether
an upstream agent CLI is involved.

## Scope

Security reports are especially useful for:

- command or argument injection;
- unintended file reads or writes during a probe;
- credential exposure in output or GitHub Action logs;
- unsafe parsing of `SKILL.md`, YAML, transcripts, or custom rules;
- path traversal when staging a skill;
- behavior that escapes the documented read-only probe boundary.

Tripwire executes locally installed agent CLIs and optional custom lint-rule modules. Those
dependencies have their own security boundaries. Reports that show Tripwire widens those boundaries
or exposes additional data are in scope.
