const body = `# Tripwire

> Tripwire is an open-source behavioral testing and CI tool for Agent Skills. It runs real agent sessions to catch missed activations and false triggers that static SKILL.md lint cannot observe.

## Start here

- Guided setup: https://tripwire.bharath.sh/setup
- Browser lint: https://tripwire.bharath.sh/playground
- GitHub repository: https://github.com/bharath31/tripwire
- npm package: https://www.npmjs.com/package/tripwire-skills
- GitHub Action: https://github.com/marketplace/actions/tripwire-for-agent-skills
- Security model: https://tripwire.bharath.sh/security
- Pricing: https://tripwire.bharath.sh/pricing.md

## Product facts

- Claude Code activation detection is live verified.
- Codex CLI and Gemini CLI adapters are experimental.
- Tripwire is free and MIT licensed.
- Browser lint and setup data remain local.
- Behavioral probes use the developer's agent CLI or provider credentials.
`;

export function GET() {
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export function HEAD() {
  return new Response(null, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
