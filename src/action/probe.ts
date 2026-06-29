import { mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runScenariosFromFile } from '../test/scenario-runner.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
import type { AgentAdapter, ProbeResult } from '../types.js';
import type { Regression, SkillProbeResult } from './types.js';
import { safeSkillName } from './context.js';

interface ProbeInput {
  skillFilePath: string;
  skillName: string;
  scenariosPath: string;
  workspace: string;
  adapterFactory?: (skillName: string) => AgentAdapter;
}

export async function probeSkill(input: ProbeInput): Promise<SkillProbeResult> {
  await stageSkill(input.skillFilePath, input.skillName, input.workspace);

  const factory = input.adapterFactory ?? ((name: string) => new ClaudeCodeAdapter(name));
  const adapter = factory(input.skillName);

  const results = await runScenariosFromFile(input.scenariosPath, adapter, () => {});
  const regressions = classifyRegressions(results);

  return { skillName: input.skillName, results, regressions };
}

async function stageSkill(skillFilePath: string, skillName: string, workspace: string): Promise<void> {
  const safe = safeSkillName(skillName);
  const target = join(workspace, '.claude', 'skills', safe, 'SKILL.md');
  if (resolve(target) === resolve(skillFilePath)) return; // already staged in place
  await mkdir(join(workspace, '.claude', 'skills', safe), { recursive: true });
  await copyFile(skillFilePath, target);
}

function classifyRegressions(results: ProbeResult[]): Regression[] {
  const out: Regression[] = [];
  for (const r of results) {
    const expected = r.prompt.zone !== 'negative';
    const activated = r.transcript.activated;
    if (expected && !activated) {
      out.push({ prompt: r.prompt.prompt, zone: r.prompt.zone, kind: 'gap' });
    } else if (!expected && activated) {
      out.push({ prompt: r.prompt.prompt, zone: r.prompt.zone, kind: 'false-positive' });
    }
  }
  return out;
}
