import { APIError } from '@anthropic-ai/sdk';

/**
 * Map Anthropic SDK failures to one actionable line instead of a stack dump.
 * A new user's first `analyze` usually fails here (bad key, rate limit) —
 * the message must say what to do, not crash.
 */
export function describeApiError(err: unknown): string {
  if (err instanceof APIError) {
    switch (err.status) {
      case 401: return 'Anthropic rejected your API key (401) — check ANTHROPIC_API_KEY.';
      case 403: return 'Anthropic denied this request (403) — the key may lack access to the requested model.';
      case 404: return 'Anthropic returned 404 — the configured model may not exist or is unavailable to your account.';
      case 429: return 'Anthropic rate limit hit (429) — wait a moment and retry, or reduce probe_count in tripwire.yaml.';
      default:
        if ((err.status ?? 0) >= 500) {
          return `Anthropic had a server error (${err.status}) — transient, try again.`;
        }
    }
  }
  return err instanceof Error ? err.message : String(err);
}
