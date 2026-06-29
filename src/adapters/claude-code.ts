import { execa } from 'execa';
import { parseTranscript } from '../analyze/transcript-parser.js';
import type { AgentAdapter, TranscriptResult } from '../types.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  constructor(private readonly skillName: string) {}

  async run(prompt: string): Promise<TranscriptResult> {
    try {
      // Skill activation is only observable in the structured stream, not in
      // plain print mode (verified via live spike). --verbose is required for
      // stream-json to emit per-message events including Skill tool_use blocks.
      const result = await execa(
        'claude',
        ['-p', prompt, '--output-format', 'stream-json', '--verbose'],
        {
          timeout: 120_000,
          reject: false,
          all: true,
        },
      );
      const output = result.all ?? result.stdout + '\n' + result.stderr;
      return parseTranscript(output, this.skillName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { activated: false, rawOutput: `[adapter error] ${msg}` };
    }
  }
}
