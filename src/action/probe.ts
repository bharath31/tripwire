import { runScenariosFromFile } from '../test/scenario-runner.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
import type { AgentAdapter, ProbeResult } from '../types.js';
import type { Regression, SkillProbeResult } from './types.js';
import { expectedActivationFor } from '../expectation.js';
import { createProbeWorkspace } from '../probe-workspace.js';

interface ProbeInput {
  skillFilePath: string;
  skillName: string;
  scenariosPath: string;
  adapterFactory?: (skillName: string, cwd: string) => AgentAdapter;
}

export async function probeSkill(input: ProbeInput): Promise<SkillProbeResult> {
  const workspace = await createProbeWorkspace('claude', input.skillFilePath, input.skillName);
  try {
    const factory = input.adapterFactory
      ?? ((name: string, cwd: string) => new ClaudeCodeAdapter(name, { cwd }));
    const adapter = factory(input.skillName, workspace.cwd);
    const results = await runScenariosFromFile(input.scenariosPath, adapter, () => {});
    const regressions = classifyRegressions(results);

    return { skillName: input.skillName, results, regressions };
  } finally {
    await workspace.cleanup();
  }
}

function classifyRegressions(results: ProbeResult[]): Regression[] {
  const out: Regression[] = [];
  for (const r of results) {
    if (r.transcript.error) {
      out.push({
        prompt: r.prompt.prompt,
        zone: r.prompt.zone,
        kind: 'infrastructure',
        error: r.transcript.error,
      });
      continue;
    }
    const expected = expectedActivationFor(r.prompt);
    const activated = r.transcript.activated;
    if (expected && !activated) {
      out.push({ prompt: r.prompt.prompt, zone: r.prompt.zone, kind: 'gap' });
    } else if (!expected && activated) {
      out.push({ prompt: r.prompt.prompt, zone: r.prompt.zone, kind: 'false-positive' });
    }
  }
  return out;
}
