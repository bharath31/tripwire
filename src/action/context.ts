export interface PrContext {
  base: string;
  head: string;
  repo: string;
  prNumber: number | null;
  token: string;
}

export function readContext(
  env: NodeJS.ProcessEnv,
  readEventFile: (path: string) => string,
): PrContext {
  const eventPath = env.GITHUB_EVENT_PATH;
  let base = env.GITHUB_BASE_REF || '';
  let head = env.GITHUB_HEAD_REF || env.GITHUB_SHA || 'HEAD';
  let prNumber: number | null = null;

  if (eventPath) {
    try {
      const event = JSON.parse(readEventFile(eventPath));
      if (event.pull_request) {
        base = event.pull_request.base?.sha || base;
        head = event.pull_request.head?.sha || head;
        prNumber = event.pull_request.number ?? null;
      } else if (event.before && event.after) {
        base = event.before;
        head = event.after;
      }
    } catch {
      // eventPath missing or unreadable — fall through to env vars
    }
  }

  return {
    base,
    head,
    repo: env.GITHUB_REPOSITORY || '',
    prNumber,
    token: env.GITHUB_TOKEN || '',
  };
}

/**
 * Strips path separators and traversal sequences from a skill name so it
 * cannot escape the staging directory when used as a path component.
 */
export function safeSkillName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '') || 'skill';
}
