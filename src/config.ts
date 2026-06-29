import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { Config } from './types.js';

export const defaultConfig: Config = {
  agent: 'claude',
  model: 'claude-sonnet-4-6',
  judge_model: 'claude-haiku-4-5-20251001',
  thresholds: { core_activation: 0.8, false_positive_rate: 0.15 },
  probe_count: { core: 8, adjacent: 8, negative: 8, variants: 5 },
};

export async function loadConfig(cwd: string = process.cwd()): Promise<Config> {
  try {
    const raw = await readFile(join(cwd, 'tripwire.yaml'), 'utf-8');
    // js-yaml v4 load() is safe by default; schema: DEFAULT_SCHEMA makes intent explicit
    const parsed = yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA }) as Partial<Config>;
    return {
      ...defaultConfig,
      ...parsed,
      thresholds: { ...defaultConfig.thresholds, ...(parsed.thresholds ?? {}) },
      probe_count: { ...defaultConfig.probe_count, ...(parsed.probe_count ?? {}) },
    };
  } catch {
    return { ...defaultConfig };
  }
}
