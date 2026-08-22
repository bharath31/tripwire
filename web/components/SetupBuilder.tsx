'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildAnalyzeCommand,
  buildGitHubWorkflowUrl,
  buildInitCommand,
  buildTestCommand,
  LINT_WORKFLOW,
  parseGitHubRepository,
  type Agent,
  type Expectation,
  type Shell,
} from '@/lib/commands';
import { trackFunnel } from '@/lib/analytics';
import { CopyButton } from './CopyButton';
import styles from './SetupBuilder.module.css';

type Stage = 'skill' | 'run' | 'result' | 'coverage' | 'ci';
type Outcome = 'pass' | 'misfire' | 'infrastructure';

interface Draft {
  agent: Agent;
  path: string;
  prompt: string;
  expectation: Expectation;
  shell: Shell;
  repo: string;
  branch: string;
}

const INITIAL: Draft = {
  agent: 'claude',
  path: './skills/my-skill',
  prompt: '',
  expectation: 'activate',
  shell: 'posix',
  repo: '',
  branch: 'main',
};

const stages: Array<{ id: Stage; label: string }> = [
  { id: 'skill', label: 'Describe one case' },
  { id: 'run', label: 'Run locally' },
  { id: 'result', label: 'Read the verdict' },
  { id: 'coverage', label: 'Expand coverage' },
  { id: 'ci', label: 'Gate pull requests' },
];

function stageIndex(stage: Stage): number {
  return stages.findIndex(item => item.id === stage);
}

export function SetupBuilder() {
  const [stage, setStage] = useState<Stage>('skill');
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [restored, setRestored] = useState(false);
  const [directCi, setDirectCi] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tripwire-setup-v1');
      if (saved) setDraft({ ...INITIAL, ...(JSON.parse(saved) as Partial<Draft>) });
    } catch {
      localStorage.removeItem('tripwire-setup-v1');
    }
    if (location.hash === '#github') {
      setDirectCi(true);
      setStage('ci');
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem('tripwire-setup-v1', JSON.stringify(draft));
  }, [draft, restored]);

  const command = useMemo(() => buildTestCommand(draft), [draft]);
  const analyze = useMemo(() => buildAnalyzeCommand(draft.path, draft.agent, draft.shell), [draft]);
  const init = useMemo(() => buildInitCommand(draft.path, draft.shell), [draft]);
  const repository = useMemo(() => parseGitHubRepository(draft.repo), [draft.repo]);
  const githubUrl = repository ? buildGitHubWorkflowUrl(repository, draft.branch) : null;
  const canBuild = draft.path.trim().length > 0 && draft.prompt.trim().length > 4;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function begin() {
    if (!canBuild) return;
    setDirectCi(false);
    setStage('run');
    trackFunnel('setup_started', { entry: 'setup_page', agent: draft.agent });
  }

  function report(next: Outcome) {
    setOutcome(next);
    setStage('result');
    trackFunnel('setup_outcome_reported', { outcome: next, agent: draft.agent });
  }

  function reset() {
    localStorage.removeItem('tripwire-setup-v1');
    setDraft(INITIAL);
    setOutcome(null);
    setDirectCi(false);
    setStage('skill');
  }

  return (
    <div className={styles.builder}>
      <aside className={styles.progress} aria-label="Setup progress">
        <div className={styles.progressIntro}>
          <span className={styles.progressKicker}>First verified run</span>
          <strong>About 3 minutes</strong>
          <p>No account. No install. Your skill and prompt stay in this browser and terminal.</p>
        </div>
        <ol>
          {stages.map((item, index) => {
            const isCurrent = item.id === stage;
            const isComplete = !directCi && index < stageIndex(stage);
            return (
              <li className={isCurrent ? styles.current : isComplete ? styles.complete : ''} key={item.id}>
                <span>{isComplete ? '✓' : index + 1}</span>
                {item.label}
              </li>
            );
          })}
        </ol>
        <button className={styles.reset} type="button" onClick={reset}>Reset private setup data</button>
      </aside>

      <section className={styles.stage}>
        {stage === 'skill' && (
          <div className={styles.stageBody}>
            <p className="eyebrow">Step 1 · One behavior</p>
            <h2>What should make this skill fire?</h2>
            <p className={styles.lede}>Start with one prompt you expect a real user to write. Tripwire will ask your existing agent CLI whether the skill activates.</p>

            <fieldset className={styles.fieldset}>
              <legend>Agent CLI</legend>
              <div className={styles.agentGrid}>
                {(['claude', 'codex', 'gemini'] as Agent[]).map(agent => (
                  <label className={`${styles.agent} ${draft.agent === agent ? styles.selected : ''}`} key={agent}>
                    <input type="radio" name="agent" value={agent} checked={draft.agent === agent} onChange={() => update('agent', agent)} />
                    <strong>{agent === 'claude' ? 'Claude Code' : agent === 'codex' ? 'Codex CLI' : 'Gemini CLI'}</strong>
                    <span>{agent === 'claude' ? 'Live verified' : 'Experimental'}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={styles.field}>
              <span>Skill path <small>from your repository root</small></span>
              <input value={draft.path} onChange={event => update('path', event.target.value)} placeholder="./skills/code-review" autoComplete="off" />
              <em>Use the skill directory or its SKILL.md file.</em>
            </label>

            <label className={styles.field}>
              <span>Representative user prompt</span>
              <textarea value={draft.prompt} onChange={event => update('prompt', event.target.value)} placeholder="Review this pull request for security problems" rows={3} />
            </label>

            <fieldset className={styles.fieldset}>
              <legend>Expected behavior</legend>
              <div className={styles.segmented}>
                <label className={draft.expectation === 'activate' ? styles.segmentSelected : ''}>
                  <input type="radio" name="expect" checked={draft.expectation === 'activate'} onChange={() => update('expectation', 'activate')} />
                  Should activate
                </label>
                <label className={draft.expectation === 'quiet' ? styles.segmentSelected : ''}>
                  <input type="radio" name="expect" checked={draft.expectation === 'quiet'} onChange={() => update('expectation', 'quiet')} />
                  Should stay quiet
                </label>
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>Terminal</legend>
              <div className={styles.segmentedSmall}>
                <label className={draft.shell === 'posix' ? styles.segmentSelected : ''}><input type="radio" name="shell" checked={draft.shell === 'posix'} onChange={() => update('shell', 'posix')} />macOS / Linux</label>
                <label className={draft.shell === 'powershell' ? styles.segmentSelected : ''}><input type="radio" name="shell" checked={draft.shell === 'powershell'} onChange={() => update('shell', 'powershell')} />PowerShell</label>
              </div>
            </fieldset>

            <button className="button button-primary" type="button" onClick={begin} disabled={!canBuild}>
              Build my test command →
            </button>
            {!canBuild && <span className={styles.inlineHint}>Add a skill path and a real prompt to continue.</span>}
            <div className={styles.githubShortcut}>
              <div><strong>Only want the pull request check?</strong><span>Start with a lint-only workflow. No provider secret required.</span></div>
              <button className="button button-small" type="button" onClick={() => { setDirectCi(true); setStage('ci'); }}>Add to GitHub →</button>
            </div>
          </div>
        )}

        {stage === 'run' && (
          <div className={styles.stageBody}>
            <p className="eyebrow">Step 2 · Your terminal</p>
            <h2>Run one real agent session.</h2>
            <p className={styles.lede}>Open a terminal at your repository root. This uses your existing {draft.agent} login and creates a disposable workspace for the probe.</p>
            <div className={styles.commandBlock}>
              <div className={styles.commandHeader}><span>Generated command</span><span>private · local</span></div>
              <code>{command}</code>
              <CopyButton
                className="button button-primary"
                value={command}
                label="Copy command"
                copiedLabel="Copied. Run it in your terminal"
                onCopy={() => trackFunnel('setup_command_copied', { step: 'first_test', agent: draft.agent })}
              />
            </div>
            <div className={styles.readResult}>
              <strong>When it finishes, which result did you see?</strong>
              <div className={styles.outcomeGrid}>
                <button type="button" onClick={() => report('pass')}><i className={styles.passDot} /><span><b>Behavior matched</b><small>The observed activation matched your expectation.</small></span></button>
                <button type="button" onClick={() => report('misfire')}><i className={styles.failDot} /><span><b>Behavior misfired</b><small>It missed the prompt or fired when it should stay quiet.</small></span></button>
                <button type="button" onClick={() => report('infrastructure')}><i className={styles.warnDot} /><span><b>Could not run</b><small>Agent login, CLI installation, or timeout failed.</small></span></button>
              </div>
            </div>
            <button className={styles.back} type="button" onClick={() => setStage('skill')}>← Edit the test case</button>
          </div>
        )}

        {stage === 'result' && outcome && (
          <div className={styles.stageBody}>
            <p className="eyebrow">Step 3 · Real verdict</p>
            <div className={`${styles.resultCard} ${styles[outcome]}`}>
              <span>{outcome === 'pass' ? '✓' : outcome === 'misfire' ? '×' : '!'}</span>
              <div>
                <h2>{outcome === 'pass' ? 'Your first behavior is verified.' : outcome === 'misfire' ? 'Tripwire caught a routing defect.' : 'The behavior was not measured.'}</h2>
                <p>{outcome === 'pass'
                  ? 'Keep this prompt as a regression case, then probe adjacent and negative language.'
                  : outcome === 'misfire'
                    ? 'Adjust the SKILL.md description, rerun the same command, and keep the case as a regression test.'
                    : `Confirm ${draft.agent} is installed and authenticated, then rerun. Infrastructure failures never count as behavioral failures.`}</p>
              </div>
            </div>
            {outcome === 'infrastructure' ? (
              <div className={styles.actionRow}>
                <button className="button button-primary" type="button" onClick={() => setStage('run')}>Retry the same command</button>
                <a className="button" href="https://github.com/bharath31/tripwire#quick-start" target="_blank" rel="noreferrer">Open troubleshooting ↗</a>
              </div>
            ) : (
              <button className="button button-primary" type="button" onClick={() => setStage('coverage')}>Expand to a test matrix →</button>
            )}
          </div>
        )}

        {stage === 'coverage' && (
          <div className={styles.stageBody}>
            <p className="eyebrow">Step 4 · Broader coverage</p>
            <h2>Turn one case into a behavioral contract.</h2>
            <p className={styles.lede}>Tripwire generates core, adjacent, negative, and paraphrased prompts, runs them, and writes a reviewable <code>tripwire-scenarios.yaml</code>.</p>
            <div className={styles.notice}>
              <strong>Before running</strong>
              <p><code>analyze</code> requires <code>ANTHROPIC_API_KEY</code> for matrix generation and judging. Typical provider cost is about $0.10–$0.50. The selected agent CLI must also be authenticated.</p>
            </div>
            <div className={styles.commandBlock}>
              <div className={styles.commandHeader}><span>Coverage command</span><span>generates scenarios</span></div>
              <code>{analyze}</code>
              <CopyButton className="button button-primary" value={analyze} label="Copy analyze command" onCopy={() => trackFunnel('setup_command_copied', { step: 'analyze', agent: draft.agent })} />
            </div>
            <div className={styles.actionRow}>
              <button className="button button-primary" type="button" onClick={() => setStage('ci')}>Add the pull request gate →</button>
              <button className="button" type="button" onClick={() => setStage('ci')}>Skip matrix for now</button>
            </div>
          </div>
        )}

        {stage === 'ci' && (
          <div className={styles.stageBody}>
            <p className="eyebrow">Step 5 · GitHub Actions</p>
            <h2>Add one workflow file.</h2>
            <p className={styles.lede}>There is no app to install and no Tripwire account. Committing <code>.github/workflows/tripwire.yml</code> activates the check for pull requests.</p>

            <div className={styles.githubBox}>
              <div>
                <strong>Fastest: review and commit on GitHub</strong>
                <p>Tripwire builds the GitHub editor link in this browser. The first workflow runs static checks without asking for a secret.</p>
              </div>
              <label className={styles.field}>
                <span>GitHub repository</span>
                <input value={draft.repo} onChange={event => update('repo', event.target.value)} placeholder="https://github.com/owner/repository" autoComplete="url" />
              </label>
              <label className={styles.fieldCompact}>
                <span>Default branch</span>
                <input value={draft.branch} onChange={event => update('branch', event.target.value)} placeholder="main" />
              </label>
              {draft.repo && !repository && <p className={styles.fieldError}>Enter a GitHub URL or owner/repository.</p>}
              {githubUrl ? (
                <a className="button button-primary" href={githubUrl} target="_blank" rel="noreferrer">Review and commit workflow on GitHub ↗</a>
              ) : (
                <span className={styles.inlineHint}>Add the repository URL to create the GitHub commit link.</span>
              )}
            </div>

            <div className={styles.or}><span>or create it locally</span></div>
            <div className={styles.commandBlock}>
              <div className={styles.commandHeader}><span>Local setup</span><span>creates the workflow</span></div>
              <code>{init}</code>
              <CopyButton className="button" value={init} label="Copy init command" onCopy={() => trackFunnel('setup_command_copied', { step: 'init', agent: draft.agent })} />
            </div>

            <details className={styles.workflowPreview}>
              <summary>Preview the lint-only workflow</summary>
              <pre><code>{LINT_WORKFLOW}</code></pre>
            </details>
            <div className={styles.notice}>
              <strong>Enable behavioral probes after the first commit</strong>
              <p>Commit <code>tripwire-scenarios.yaml</code>, add <code>ANTHROPIC_API_KEY</code> as a repository secret, then set <code>probe: true</code>. Until then the Action still blocks structural lint errors.</p>
            </div>
            {directCi && <button className={styles.back} type="button" onClick={() => { setDirectCi(false); setStage('skill'); }}>← Run a behavioral prompt instead</button>}
          </div>
        )}
      </section>
    </div>
  );
}
