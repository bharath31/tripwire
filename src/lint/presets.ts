import type { RuleConfig } from './registry.js';

// Only one preset exists today: every built-in rule at its default level —
// i.e. identical to tripwire's behavior before `extends`/`rules` existed at
// all. More presets (e.g. a stricter "tripwire:strict") can be added here
// without touching anything that resolves them.
export const PRESETS: Record<string, RuleConfig> = {
  'tripwire:recommended': {},
};

export function resolvePreset(name: string): RuleConfig {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(`Unknown preset "${name}" in \`extends\` (known presets: ${Object.keys(PRESETS).join(', ')})`);
  }
  return preset;
}
