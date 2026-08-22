import { readFile } from 'node:fs/promises';
import * as yaml from 'js-yaml';
import type { AgentAdapter, ProbeResult, ProbeZone, Scenario, ScenariosFile } from '../types.js';
import { mapConcurrent } from '../concurrency.js';

const ZONES = new Set<ProbeZone>(['core', 'adjacent', 'negative', 'variants']);

function parseScenarios(loaded: unknown): Scenario[] {
  if (!loaded || typeof loaded !== 'object' || !Array.isArray((loaded as { scenarios?: unknown }).scenarios)) {
    throw new Error('Invalid scenarios file: expected a top-level `scenarios` array');
  }
  const values = (loaded as { scenarios: unknown[] }).scenarios;
  if (values.length === 0) {
    throw new Error('Invalid scenarios file: `scenarios` must contain at least one entry');
  }

  const scenarios: Scenario[] = [];
  const problems: string[] = [];
  values.forEach((value, index) => {
    if (!value || typeof value !== 'object') {
      problems.push(`Invalid scenario at index ${index}: expected an object`);
      return;
    }
    const candidate = value as Partial<Scenario>;
    let valid = true;
    if (typeof candidate.prompt !== 'string' || candidate.prompt.trim() === '') {
      problems.push(`Invalid scenario at index ${index}: \`prompt\` must be a non-empty string`);
      valid = false;
    }
    const validZone = typeof candidate.zone === 'string' && ZONES.has(candidate.zone as ProbeZone);
    if (!validZone) {
      problems.push(`Invalid scenario at index ${index}: unknown \`zone\` "${String(candidate.zone)}"`);
      valid = false;
    }
    if (candidate.expectedActivation !== undefined && typeof candidate.expectedActivation !== 'boolean') {
      problems.push(`Invalid scenario at index ${index}: \`expectedActivation\` must be a boolean`);
      valid = false;
    }
    // Scenario files generated before expectedActivation was propagated used
    // the zone convention. Keep them runnable; when the explicit field is
    // present it remains authoritative, including intentional boundary cases.
    if (valid) {
      scenarios.push({
        prompt: candidate.prompt as string,
        zone: candidate.zone as ProbeZone,
        expectedActivation: typeof candidate.expectedActivation === 'boolean'
          ? candidate.expectedActivation
          : candidate.zone !== 'negative',
      });
    }
  });

  if (problems.length > 0) {
    throw new Error(`invalid tripwire-scenarios.yaml:\n  - ${problems.join('\n  - ')}`);
  }
  return scenarios;
}

/**
 * Load a scenarios file with day-1-friendly errors: a missing file says what
 * to do next, malformed YAML names the offending file, and a skillName
 * mismatch refuses to measure one skill with another skill's committed
 * contract (the usual accident after renaming or copying a skill dir).
 */
export async function loadScenariosFile(scenariosPath: string, expectedSkillName?: string): Promise<ScenariosFile> {
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
    doc = yaml.load(raw);
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
    scenarios: parseScenarios(doc),
  };
}

export async function runScenarios(
  scenarios: Scenario[],
  adapter: AgentAdapter,
  onProgress: (done: number, total: number) => void,
  concurrency = 3,
): Promise<ProbeResult[]> {
  return mapConcurrent(scenarios, concurrency, async (s) => {
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

export async function runScenariosFromFile(
  scenariosPath: string,
  adapter: AgentAdapter,
  onProgress: (done: number, total: number) => void,
  concurrency = 3,
  expectedSkillName?: string,
): Promise<ProbeResult[]> {
  const file = await loadScenariosFile(scenariosPath, expectedSkillName);
  return runScenarios(file.scenarios, adapter, onProgress, concurrency);
}
