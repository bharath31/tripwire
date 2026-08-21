# Contributing

Thanks for helping improve Tripwire.

## Do not commit internal or sensitive material

This repository is public. Never commit:

- Launch plans, growth targets, funnel metrics, or announcement drafts (for example `LAUNCH.md`)
- Product marketing context, positioning notes, or early traction numbers (for example `.agents/product-marketing.md`)
- Agent workspace scratch, session notes, or Conductor plans (`.context/`)
- Credentials, API keys, tokens, or private customer data

Keep that material in a local-only path such as `.context/` (gitignored) or outside the repository.

Before opening a pull request, scan your diff for metrics, targets, draft copy, and other information that is useful internally but should not be public.

## Development

```bash
npm install
npm test
```

See the [README](./README.md) for CLI usage and the production workflow.
