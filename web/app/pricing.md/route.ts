const body = `# Tripwire pricing

Last updated: 2026-08-22

## Open-source edition

- Price: $0
- License: MIT
- Users and repositories: unlimited
- Static SKILL.md lint: included
- Real-agent activation tests: included
- GitHub Action: included
- Scenario generation, replay, conflict checks, drift checks, and response evals: included

Tripwire has no hosted subscription or paid plan. Behavioral probes use your existing agent login or model-provider credentials, so your provider may charge for model usage. Tripwire does not add a fee or markup.

Start at https://tripwire.bharath.sh/setup

Source and license: https://github.com/bharath31/tripwire
`;

export function GET() {
  return new Response(body, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export function HEAD() {
  return new Response(null, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
