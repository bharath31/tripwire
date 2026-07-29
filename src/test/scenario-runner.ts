import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type { AgentAdapter, ProbeResult, ProbeZone, Scenario } from '../types.js';

const ZONES = new Set<ProbeZone>(['core', 'adjacent', 'negative', 'variants']);

function parseScenarios(raw: string): Scenario[] {
  const loaded = yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA });
  if (!loaded || typeof loaded !== 'object' || !Array.isArray((loaded as { scenarios?: unknown }).scenarios)) {
    throw new Error('Invalid scenarios file: expected a top-level `scenarios` array');
  }

  return (loaded as { scenarios: unknown[] }).scenarios.map((value, index) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`Invalid scenario at index ${index}: expected an object`);
    }
    const candidate = value as Partial<Scenario>;
    if (typeof candidate.prompt !== 'string' || candidate.prompt.trim() === '') {
      throw new Error(`Invalid scenario at index ${index}: \`prompt\` must be a non-empty string`);
    }
    if (typeof candidate.zone !== 'string' || !ZONES.has(candidate.zone as ProbeZone)) {
      throw new Error(`Invalid scenario at index ${index}: unknown \`zone\` "${String(candidate.zone)}"`);
    }

    // Scenario files generated before expectedActivation was propagated used
    // the same zone convention. Keep them runnable while ensuring every result
    // from this point forward carries an explicit expectation.
    const expectedActivation = typeof candidate.expectedActivation === 'boolean'
      ? candidate.expectedActivation
      : candidate.zone !== 'negative';

    return {
      prompt: candidate.prompt,
      zone: candidate.zone as ProbeZone,
      expectedActivation,
    };
  });
}

export async function runScenariosFromFile(
  scenariosPath: string,
  adapter: AgentAdapter,
  onProgress: (done: number, total: number) => void,
): Promise<ProbeResult[]> {
  const raw = await readFile(scenariosPath, 'utf-8');
  const scenarios = parseScenarios(raw);
  const results: ProbeResult[] = [];
  const total = scenarios.length;

  for (let i = 0; i < total; i++) {
    const s = scenarios[i];
    const transcript = await adapter.run(s.prompt);
    results.push({
      prompt: {
        zone: s.zone,
        prompt: s.prompt,
        expectedActivation: s.expectedActivation,
      },
      transcript,
    });
    onProgress(i + 1, total);
  }

  return results;
}
