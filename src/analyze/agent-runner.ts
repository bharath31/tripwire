import type { ProbeMatrix, AgentAdapter, ProbeResult } from '../types.js';
import { mapConcurrent } from '../concurrency.js';

export async function runProbes(
  matrix: ProbeMatrix,
  adapter: AgentAdapter,
  onProgress: (done: number, total: number) => void,
  concurrency = 3,
): Promise<ProbeResult[]> {
  return mapConcurrent(matrix.prompts, concurrency, async (prompt) => {
    const transcript = await adapter.run(prompt.prompt);
    return { prompt, transcript };
  }, onProgress);
}
