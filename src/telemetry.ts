import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import pkg from '../package.json';

const DEFAULT_ENDPOINT = 'https://tripwire.bharath.sh/api/events';

export type BehavioralCommand = 'analyze' | 'test' | 'test-all' | 'action';
export type BehavioralOutcome = 'pass' | 'behavior_failure' | 'infrastructure_error';

interface TelemetryState {
  installationId: string;
  noticeShown: boolean;
}

interface TrackOptions {
  endpoint?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  homeDir?: string;
  log?: (message: string) => void;
}

export interface TelemetryPayload {
  event: 'behavioral_run_completed';
  installation_id: string;
  command: BehavioralCommand;
  agent: string;
  outcome: BehavioralOutcome;
  source: 'cli' | 'github_action';
  version: string;
}

export function telemetryDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DO_NOT_TRACK === '1'
    || env.TRIPWIRE_TELEMETRY === '0'
    || env.TRIPWIRE_TELEMETRY_DISABLED === '1';
}

function hashIdentity(value: string): string {
  return createHash('sha256').update(`tripwire-v1:${value}`).digest('hex').slice(0, 32);
}

function statePath(env: NodeJS.ProcessEnv, homeDir: string): string {
  const configRoot = env.XDG_CONFIG_HOME || join(homeDir, '.config');
  return join(configRoot, 'tripwire', 'telemetry.json');
}

async function localIdentity(
  env: NodeJS.ProcessEnv,
  homeDir: string,
): Promise<{ id: string; noticeShown: boolean; markNoticeShown(): Promise<void> }> {
  const path = statePath(env, homeDir);
  let state: TelemetryState | undefined;
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as Partial<TelemetryState>;
    if (typeof parsed.installationId === 'string' && parsed.installationId.length > 10) {
      state = {
        installationId: parsed.installationId,
        noticeShown: parsed.noticeShown === true,
      };
    }
  } catch {
    // First run or an unreadable state file. A fresh random identity is safe.
  }

  state ??= { installationId: randomUUID(), noticeShown: false };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });

  return {
    id: hashIdentity(state.installationId),
    noticeShown: state.noticeShown,
    markNoticeShown: async () => {
      if (state!.noticeShown) return;
      state!.noticeShown = true;
      await writeFile(path, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    },
  };
}

export async function buildTelemetryPayload(
  command: BehavioralCommand,
  agent: string,
  outcome: BehavioralOutcome,
  options: Pick<TrackOptions, 'env' | 'homeDir'> = {},
): Promise<{ payload: TelemetryPayload; noticeShown: boolean; markNoticeShown(): Promise<void> }> {
  const env = options.env ?? process.env;
  const githubRepositoryId = env.GITHUB_REPOSITORY_ID;
  const source = env.GITHUB_ACTIONS === 'true' ? 'github_action' : 'cli';

  if (githubRepositoryId) {
    return {
      payload: {
        event: 'behavioral_run_completed',
        installation_id: hashIdentity(`github:${githubRepositoryId}`),
        command,
        agent,
        outcome,
        source,
        version: pkg.version,
      },
      noticeShown: true,
      markNoticeShown: async () => {},
    };
  }

  const identity = await localIdentity(env, options.homeDir ?? homedir());
  return {
    payload: {
      event: 'behavioral_run_completed',
      installation_id: identity.id,
      command,
      agent,
      outcome,
      source,
      version: pkg.version,
    },
    noticeShown: identity.noticeShown,
    markNoticeShown: identity.markNoticeShown,
  };
}

export async function trackBehavioralRun(
  command: BehavioralCommand,
  agent: string,
  outcome: BehavioralOutcome,
  options: TrackOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  if (telemetryDisabled(env)) return;

  try {
    const event = await buildTelemetryPayload(command, agent, outcome, options);
    if (!event.noticeShown) {
      (options.log ?? console.log)(
        'tripwire: anonymous usage telemetry is enabled; no prompts, paths, skill names, or credentials are collected. '
        + 'Disable with TRIPWIRE_TELEMETRY=0.',
      );
      await event.markNoticeShown();
    }

    await (options.fetchImpl ?? fetch)(options.endpoint ?? DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': `tripwire/${pkg.version}`,
      },
      body: JSON.stringify(event.payload),
      signal: AbortSignal.timeout(800),
    });
  } catch {
    // Telemetry must never change command output or exit status.
  }
}
