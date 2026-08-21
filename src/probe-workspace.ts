import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const AGENT_SKILL_ROOTS: Record<string, string[]> = {
  claude: ['.claude', 'skills'],
  gemini: ['.gemini', 'skills'],
  codex: ['.agents', 'skills'],
};

function safeSkillName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '') || 'skill';
}

export interface ProbeWorkspace {
  cwd: string;
  skillPath: string;
  cleanup(): Promise<void>;
}

/**
 * Builds an isolated, disposable workspace containing the skill at the
 * discovery path used by the selected agent. Activation probes only need the
 * skill package itself, so they should not run with write access to the user's
 * repository.
 */
export async function createProbeWorkspace(
  agent: string,
  skillFilePath: string,
  skillName: string,
): Promise<ProbeWorkspace> {
  const rootParts = AGENT_SKILL_ROOTS[agent];
  if (!rootParts) {
    throw new Error(`Cannot stage skill for unknown agent "${agent}"`);
  }

  const cwd = await mkdtemp(join(tmpdir(), 'tripwire-probe-'));
  const skillDir = join(cwd, ...rootParts, safeSkillName(skillName));
  const skillPath = join(skillDir, 'SKILL.md');
  await mkdir(skillDir, { recursive: true });
  await copyFile(skillFilePath, skillPath);

  return {
    cwd,
    skillPath,
    cleanup: () => rm(cwd, { recursive: true, force: true }),
  };
}
