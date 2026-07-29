import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type { Config } from './types.js';
import { findTripwireConfig } from './config-path.js';

export const defaultConfig: Config = {
  agent: 'claude',
  model: 'claude-sonnet-4-6',
  judge_model: 'claude-haiku-4-5-20251001',
  concurrency: 3,
  probe_count: { core: 8, adjacent: 8, negative: 8, variants: 5 },
};

export async function loadConfig(cwd: string = process.cwd()): Promise<Config> {
  const configPath = await findTripwireConfig(cwd);
  if (!configPath) return structuredClone(defaultConfig);

  const raw = await readFile(configPath, 'utf-8');
  // js-yaml v4 load() is safe by default; schema: DEFAULT_SCHEMA makes intent explicit.
  const value = yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA });
  if (value == null) return structuredClone(defaultConfig);
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${configPath}: expected a YAML mapping`);
  }

  const parsed = value as Record<string, unknown>;
  const config = structuredClone(defaultConfig);

  for (const key of ['agent', 'model', 'judge_model'] as const) {
    if (parsed[key] === undefined) continue;
    if (typeof parsed[key] !== 'string' || parsed[key].trim() === '') {
      throw new Error(`Invalid ${configPath}: ${key} must be a non-empty string`);
    }
    config[key] = parsed[key];
  }

  if (parsed.concurrency !== undefined) {
    if (
      !Number.isInteger(parsed.concurrency)
      || (parsed.concurrency as number) < 1
      || (parsed.concurrency as number) > 10
    ) {
      throw new Error(`Invalid ${configPath}: concurrency must be an integer from 1 to 10`);
    }
    config.concurrency = parsed.concurrency as number;
  }

  if (parsed.probe_count !== undefined) {
    if (
      typeof parsed.probe_count !== 'object'
      || parsed.probe_count == null
      || Array.isArray(parsed.probe_count)
    ) {
      throw new Error(`Invalid ${configPath}: probe_count must be a mapping`);
    }
    const counts = parsed.probe_count as Record<string, unknown>;
    for (const zone of ['core', 'adjacent', 'negative', 'variants'] as const) {
      if (counts[zone] === undefined) continue;
      const count = counts[zone];
      if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > 100) {
        throw new Error(`Invalid ${configPath}: probe_count.${zone} must be an integer from 0 to 100`);
      }
      config.probe_count[zone] = count as number;
    }
  }

  return config;
}
