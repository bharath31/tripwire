import type { ProbePrompt } from './types.js';

/**
 * Read the explicit scenario contract when present. The zone fallback keeps
 * scenario files generated before expectedActivation was propagated working.
 */
export function expectedActivationFor(prompt: ProbePrompt): boolean {
  return typeof prompt.expectedActivation === 'boolean'
    ? prompt.expectedActivation
    : prompt.zone !== 'negative';
}
