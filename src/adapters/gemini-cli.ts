import { execa } from 'execa';
import { parseGeminiTranscript } from '../analyze/gemini-transcript-parser.js';
import type { AgentAdapter, TranscriptResult } from '../types.js';

interface GeminiCliAdapterOptions {
  cwd?: string;
}

export class GeminiCliAdapter implements AgentAdapter {
  constructor(
    private readonly skillName: string,
    private readonly options: GeminiCliAdapterOptions = {},
  ) {}

  async run(prompt: string): Promise<TranscriptResult> {
    try {
      // --output-format stream-json is required for tool-call visibility (the
      // plain `json` format only returns a final summary, no tool events).
      // Plan mode keeps activation probing read-only while still allowing the
      // activate_skill tool. This adapter still needs a live-install canary
      // before it graduates from experimental support.
      const result = await execa(
        'gemini',
        ['-p', prompt, '--output-format', 'stream-json', '--approval-mode', 'plan'],
        {
          cwd: this.options.cwd,
          timeout: 120_000,
          reject: false,
          all: true,
        },
      );
      const output = result.all ?? result.stdout + '\n' + result.stderr;
      if (result.exitCode !== 0) {
        return {
          activated: false,
          rawOutput: output,
          error: `Gemini CLI exited with code ${result.exitCode ?? 'unknown'}`,
        };
      }
      return parseGeminiTranscript(output, this.skillName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { activated: false, rawOutput: `[adapter error] ${msg}`, error: msg };
    }
  }
}
