import { execa } from 'execa';
import { parseCodexTranscript } from '../analyze/codex-transcript-parser.js';
import type { AgentAdapter, TranscriptResult } from '../types.js';

interface CodexCliAdapterOptions {
  cwd?: string;
}

/**
 * LOWER CONFIDENCE than ClaudeCodeAdapter / GeminiCliAdapter — see the
 * parser's doc comment. Codex CLI doesn't expose a dedicated skill-
 * invocation event, so detection is heuristic (pattern-matching a file-read
 * command against a skills path), not a structured field match.
 */
export class CodexCliAdapter implements AgentAdapter {
  constructor(
    private readonly skillName: string,
    private readonly options: CodexCliAdapterOptions = {},
  ) {}

  async run(prompt: string): Promise<TranscriptResult> {
    try {
      // `codex exec --json` is the non-interactive, machine-readable mode
      // (no `-p` flag — the prompt is positional). --skip-git-repo-check
      // avoids a hard failure when probing outside a git repo (e.g. a
      // fixture dir). Activation probes only need to observe skill reads, so a
      // read-only sandbox prevents the test session from modifying the repo.
      // Not verified against a live `codex` install.
      const result = await execa(
        'codex',
        ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', prompt],
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
          error: `Codex CLI exited with code ${result.exitCode ?? 'unknown'}`,
        };
      }
      return parseCodexTranscript(output, this.skillName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { activated: false, rawOutput: `[adapter error] ${msg}`, error: msg };
    }
  }
}
