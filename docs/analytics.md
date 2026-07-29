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

[`wrangler.jsonc`](../wrangler.jsonc) declares the Pages project and its Analytics Engine binding:

- Variable name: `PRODUCT_ANALYTICS`
- Dataset: `tripwire_product_events`

The dataset is created automatically on its first write. The endpoint still returns `204` if the
binding is absent, so telemetry never blocks the CLI.

Example DAU query:

```sql
SELECT
  toDate(timestamp) AS day,
  COUNT(DISTINCT index1) AS dau
FROM tripwire_product_events
WHERE
  blob1 = 'behavioral_run_completed'
  AND blob4 IN ('pass', 'behavior_failure')
GROUP BY day
ORDER BY day DESC
```

`blob1` through `blob6` map to event, command, agent, outcome, version, and source.
