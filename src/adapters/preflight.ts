import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

export const AGENT_BINARIES = {
  claude: { bin: 'claude', install: 'npm install -g @anthropic-ai/claude-code' },
  gemini: { bin: 'gemini', install: 'npm install -g @google/gemini-cli' },
  codex: { bin: 'codex', install: 'npm install -g @openai/codex' },
} as const;

export type PreflightAgent = keyof typeof AGENT_BINARIES;

const WINDOWS_EXTS = ['.cmd', '.exe', '.bat'];

/** Locate `bin` on the given PATH list without spawning a shell. */
export function findBinaryOnPath(
  bin: string,
  pathList: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  // Windows separates PATH entries with ';' — splitting on ':' would shred
  // drive letters (C:\...). Unix uses ':'.
  const sep = platform === 'win32' ? ';' : ':';
  for (const dir of pathList.split(sep).filter(Boolean)) {
    if (existsSync(join(dir, bin))) return join(dir, bin);
    if (platform === 'win32') {
      for (const ext of WINDOWS_EXTS) {
        const p = join(dir, bin + ext);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

/**
 * Tripwire measures activation by running real agent sessions. If the agent
 * CLI isn't installed, every session silently "fails" and coverage reports
 * 100% gaps — indistinguishable from a genuinely broken skill. Refuse to run
 * and say how to fix it.
 */
export function assertAgentBinaryAvailable(
  agent: PreflightAgent,
  pathList: string = process.env.PATH ?? '',
): void {
  const { bin, install } = AGENT_BINARIES[agent];
  if (findBinaryOnPath(bin, pathList)) return;

  throw new Error(
    `${bin} CLI not found in PATH — tripwire probes activation by running real ${agent} sessions, ` +
    `so it can't measure anything without it.\n` +
    `Install it: ${chalk.bold(install)}\n` +
    `Or probe against a different agent with --agent (claude|gemini|codex).`,
  );
}
