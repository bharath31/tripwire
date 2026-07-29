# Product analytics

Tripwire measures behavioral use, not page views, as its product north star.

## Metric definitions

| Metric | Definition |
|---|---|
| Activated install | A unique anonymous install or repository produces a valid `analyze`, `test`, `test-all`, or Action probe verdict |
| DAU | Distinct activated install IDs on a UTC day |
| 7-day retained install | An activated ID records another valid behavioral run within seven days |
| Infrastructure-error rate | Behavioral runs ending in an agent, authentication, or timeout error |

Lint-only runs, browser playground use, npm downloads, and landing-page visits do not count as
active product use.

## Event contract

`behavioral_run_completed` contains only:

| Property | Purpose |
|---|---|
| `installation_id` | SHA-256-derived anonymous local ID or GitHub repository ID |
| `command` | `analyze`, `test`, `test-all`, or `action` |
| `agent` | Selected runtime adapter |
| `outcome` | `pass`, `behavior_failure`, or `infrastructure_error` |
| `source` | `cli` or `github_action` |
| `version` | Tripwire package version |

Tripwire never sends prompts, skill names, file paths, repository names, model output, usernames, or
credentials. Local identity state lives at `$XDG_CONFIG_HOME/tripwire/telemetry.json` or
`~/.config/tripwire/telemetry.json`. Set `TRIPWIRE_TELEMETRY=0`,
`TRIPWIRE_TELEMETRY_DISABLED=1`, or `DO_NOT_TRACK=1` to disable it.

## Cloudflare setup

[`wrangler.jsonc`](../wrangler.jsonc) declares the Pages project and its D1 binding:

- Variable name: `PRODUCT_ANALYTICS`
- Database: `tripwire-product-analytics`
- Table: `behavioral_events`

Apply committed migrations before deploying a function that depends on them:

```bash
npx wrangler d1 migrations apply tripwire-product-analytics --remote
```

The repository deployment token is intentionally limited to Pages publishing, so schema changes
are an explicit operator step. The endpoint still returns `204` if the binding is absent, so
telemetry never blocks the CLI. It returns `503` when a configured database rejects an event so
operational checks can detect lost data; the CLI deliberately ignores that response.

Example DAU query:

```sql
SELECT
  date(occurred_at) AS day,
  COUNT(DISTINCT installation_id) AS dau
FROM behavioral_events
WHERE
  event = 'behavioral_run_completed'
  AND outcome IN ('pass', 'behavior_failure')
GROUP BY day
ORDER BY day DESC
```

Run it against production with:

```bash
npx wrangler d1 execute tripwire-product-analytics --remote \
  --command "SELECT date(occurred_at) AS day, COUNT(DISTINCT installation_id) AS dau FROM behavioral_events WHERE event = 'behavioral_run_completed' AND outcome IN ('pass', 'behavior_failure') GROUP BY day ORDER BY day DESC"
```
