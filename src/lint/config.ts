import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import yaml from 'js-yaml';
import type { Rule } from './rule-types.js';
import type { RuleConfig } from './registry.js';
import { resolvePreset } from './presets.js';
import { loadCustomRules } from './plugin-loader.js';
import { findTripwireConfig } from '../config-path.js';

export interface LintConfigFile {
  extends?: string | string[];
  rules?: RuleConfig;
  plugins?: string[];
}

export interface ResolvedLintConfig {
  ruleConfig: RuleConfig;
  customRules: Rule[];
}

/**
 * Reads the same `tripwire.yaml` the probe config lives in (a different set
 * of top-level keys: `extends` / `rules` / `plugins`), resolves any preset(s)
 * named in `extends`, layers explicit `rules` overrides on top (explicit
 * always wins over a preset, same precedence ESLint uses), and loads any
 * custom rule files listed under `plugins`. Missing file or missing keys
 * both resolve to "no overrides, no custom rules" — identical to tripwire's
 * behavior before this config existed.
 */
export async function loadLintConfig(cwd: string = process.cwd()): Promise<ResolvedLintConfig> {
  const configPath = await findTripwireConfig(cwd);
  if (!configPath) return { ruleConfig: {}, customRules: [] };

  const text = await readFile(configPath, 'utf-8');
  const value = yaml.load(text, { schema: yaml.DEFAULT_SCHEMA });
  if (value == null) return { ruleConfig: {}, customRules: [] };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${configPath}: expected a YAML mapping`);
  }
  const raw = value as LintConfigFile;
  const configDir = dirname(configPath);

  const extendsNames = raw.extends ? (Array.isArray(raw.extends) ? raw.extends : [raw.extends]) : [];
  let ruleConfig: RuleConfig = {};
  for (const name of extendsNames) {
    ruleConfig = { ...ruleConfig, ...resolvePreset(name) };
  }
  ruleConfig = { ...ruleConfig, ...(raw.rules ?? {}) };

  const customRules: Rule[] = [];
  for (const pluginPath of raw.plugins ?? []) {
    customRules.push(...(await loadCustomRules(pluginPath, configDir)));
  }

  return { ruleConfig, customRules };
}
