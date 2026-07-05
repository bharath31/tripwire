import { execa } from 'execa';
import { parseGeminiTranscript } from '../analyze/gemini-transcript-parser.js';
import type { AgentAdapter, TranscriptResult } from '../types.js';

export class GeminiCliAdapter implements AgentAdapter {
  constructor(private readonly skillName: string) {}

  async run(prompt: string): Promise<TranscriptResult> {
    try {
      // --output-format stream-json is required for tool-call visibility (the
      // plain `json` format only returns a final summary, no tool events).
      // --approval-mode auto_edit avoids an interactive confirmation prompt
      // that would otherwise hang a non-interactive probe — this flag choice
      // is NOT verified against a live `gemini` install, unlike the Claude
      // Code adapter; validate before relying on it in production.
      const result = await execa(
        'gemini',
        ['-p', prompt, '--output-format', 'stream-json', '--approval-mode', 'auto_edit'],
        {
          timeout: 120_000,
          reject: false,
          all: true,
        },
      );
      const output = result.all ?? result.stdout + '\n' + result.stderr;
      return parseGeminiTranscript(output, this.skillName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { activated: false, rawOutput: `[adapter error] ${msg}` };
    }
  }
}
