import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type { AgentAdapter, ProbeResult, ScenariosFile } from '../types.js';

export async function runScenariosFromFile(
  scenariosPath: string,
  adapter: AgentAdapter,
  onProgress: (done: number, total: number) => void,
): Promise<ProbeResult[]> {
  const raw = await readFile(scenariosPath, 'utf-8');
  const file = yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA }) as ScenariosFile;
  const results: ProbeResult[] = [];
  const total = file.scenarios.length;

  for (let i = 0; i < total; i++) {
    const s = file.scenarios[i];
    const transcript = await adapter.run(s.prompt);
    results.push({ prompt: { zone: s.zone, prompt: s.prompt }, transcript });
    onProgress(i + 1, total);
  }

  return results;
}
