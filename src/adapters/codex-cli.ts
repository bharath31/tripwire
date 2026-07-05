import { execa } from 'execa';
import { parseCodexTranscript } from '../analyze/codex-transcript-parser.js';
import type { AgentAdapter, TranscriptResult } from '../types.js';

/**
 * LOWER CONFIDENCE than ClaudeCodeAdapter / GeminiCliAdapter — see the
 * parser's doc comment. Codex CLI doesn't expose a dedicated skill-
 * invocation event, so detection is heuristic (pattern-matching a file-read
 * command against a skills path), not a structured field match.
 */
export class CodexCliAdapter implements AgentAdapter {
  constructor(private readonly skillName: string) {}

  async run(prompt: string): Promise<TranscriptResult> {
    try {
      // `codex exec --json` is the non-interactive, machine-readable mode
      // (no `-p` flag — the prompt is positional). --skip-git-repo-check
      // avoids a hard failure when probing outside a git repo (e.g. a
      // fixture dir). --sandbox workspace-write avoids an approval prompt
      // for file reads. Not verified against a live `codex` install.
      const result = await execa(
        'codex',
        ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', prompt],
        {
          timeout: 120_000,
          reject: false,
          all: true,
        },
      );
      const output = result.all ?? result.stdout + '\n' + result.stderr;
      return parseCodexTranscript(output, this.skillName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { activated: false, rawOutput: `[adapter error] ${msg}` };
    }
  }
}
