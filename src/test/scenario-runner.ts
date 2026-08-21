import { readFile } from 'node:fs/promises';
import * as yaml from 'js-yaml';
import type { AgentAdapter, ProbeResult, ProbeZone, Scenario, ScenariosFile } from '../types.js';
import { mapConcurrent } from '../concurrency.js';

const ZONES = new Set<ProbeZone>(['core', 'adjacent', 'negative', 'variants']);

function parseScenarios(raw: string): Scenario[] {
  const loaded = yaml.load(raw);
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

/**
 * Load a scenarios file with day-1-friendly errors: a missing file says what
 * to do next, malformed YAML names the offending file, and a skillName
 * mismatch refuses to measure one skill with another skill's committed
 * contract (the usual accident after renaming or copying a skill dir).
 */
async function loadScenariosFile(scenariosPath: string, expectedSkillName?: string): Promise<ScenariosFile> {
  let raw: string;
  try {
    raw = await readFile(scenariosPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new Error(
        `no scenarios file found at ${scenariosPath}\n` +
        `Run 'tripwire analyze' on the skill first to generate one, then commit tripwire-scenarios.yaml alongside it.`,
      );
    }
    throw err;
  }

  let doc: unknown;
  try {
    doc = yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA });
  } catch (err) {
    throw new Error(`invalid YAML in ${scenariosPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const candidate = (doc ?? {}) as Partial<ScenariosFile>;
  if (typeof candidate.skillName !== 'string' || candidate.skillName.trim().length === 0) {
    throw new Error(`${scenariosPath} is missing \`skillName\` — run \`tripwire analyze <skill>\` to regenerate it`);
  }
  if (expectedSkillName && candidate.skillName !== expectedSkillName) {
    throw new Error(
      `${scenariosPath} belongs to skill "${candidate.skillName}", but you are testing "${expectedSkillName}".\n` +
      `Re-run 'tripwire analyze' on this skill to generate matching scenarios.`,
    );
  }

  return {
    skillName: candidate.skillName,
    generatedAt: typeof candidate.generatedAt === 'string' ? candidate.generatedAt : '',
    scenarios: parseScenarios(raw),
  };
}

export async function runScenariosFromFile(
  scenariosPath: string,
  adapter: AgentAdapter,
  onProgress: (done: number, total: number) => void,
  concurrency = 3,
  expectedSkillName?: string,
): Promise<ProbeResult[]> {
  const file = await loadScenariosFile(scenariosPath, expectedSkillName);
  return mapConcurrent(file.scenarios, concurrency, async (s) => {
    const transcript = await adapter.run(s.prompt);
    return {
      prompt: {
        zone: s.zone,
        prompt: s.prompt,
        expectedActivation: s.expectedActivation,
      },
      transcript,
    };
  }, onProgress);
}
