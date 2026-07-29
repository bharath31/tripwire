import { execa } from 'execa';
import { parseTranscript } from '../analyze/transcript-parser.js';
import type { AgentAdapter, TranscriptResult } from '../types.js';

interface ClaudeCodeAdapterOptions {
  cwd?: string;
}

export function claudeFailureReason(output: string): string | undefined {
  const lines = output.split(/\r?\n/).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        is_error?: boolean;
        result?: unknown;
        error?: unknown;
      };
      if (event.type === 'result' && event.is_error && typeof event.result === 'string') {
        return event.result.slice(0, 300);
      }
      if (typeof event.error === 'string') return event.error.slice(0, 300);
    } catch {
      // Structured output can contain non-JSON diagnostics between events.
    }
  }
  return undefined;
}

export class ClaudeCodeAdapter implements AgentAdapter {
  constructor(
    private readonly skillName: string,
    private readonly options: ClaudeCodeAdapterOptions = {},
  ) {}

  async run(prompt: string): Promise<TranscriptResult> {
    try {
      // Skill activation is only observable in the structured stream, not in
      // plain print mode (verified via live spike). --verbose is required for
      // stream-json to emit per-message events including Skill tool_use blocks.
      const result = await execa(
        'claude',
        [
          '-p',
          prompt,
          '--output-format',
          'stream-json',
          '--verbose',
          '--max-turns',
          '3',
          '--permission-mode',
          'plan',
        ],
        {
          cwd: this.options.cwd,
          timeout: 120_000,
          reject: false,
          all: true,
        },
      );
      const output = result.all ?? result.stdout + '\n' + result.stderr;
      if (result.exitCode !== 0) {
        const reason = claudeFailureReason(output);
        return {
          activated: false,
          rawOutput: output,
          error: `Claude Code exited with code ${result.exitCode ?? 'unknown'}${reason ? `: ${reason}` : ''}`,
        };
      }
      return parseTranscript(output, this.skillName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { activated: false, rawOutput: `[adapter error] ${msg}`, error: msg };
    }
  }
}
