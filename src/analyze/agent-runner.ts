import type { ProbeMatrix, AgentAdapter, ProbeResult } from '../types.js';

export async function runProbes(
  matrix: ProbeMatrix,
  adapter: AgentAdapter,
  onProgress: (done: number, total: number) => void,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const total = matrix.prompts.length;

  for (let i = 0; i < total; i++) {
    const prompt = matrix.prompts[i];
    const transcript = await adapter.run(prompt.prompt);
    results.push({ prompt, transcript });
    onProgress(i + 1, total);
  }

  return results;
}
