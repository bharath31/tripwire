'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LintResult } from '../../src/types';
import { lintSource } from '../src/engine';
import { BAD_SKILL, GOOD_SKILL } from '@/lib/examples';
import { buildShareCardUrl, buildShareUrl, readShareState, skillNameFrom } from '@/lib/share';
import { trackFunnel } from '@/lib/analytics';
import { CopyButton } from './CopyButton';
import styles from './Playground.module.css';

type Source = 'typed' | 'example' | 'file' | 'shared';
type Report =
  | { kind: 'empty' }
  | { kind: 'result'; value: LintResult }
  | { kind: 'parse'; message: string };

function reportKind(report: Report): 'empty' | 'pass' | 'warn' | 'fail' | 'parse' {
  if (report.kind !== 'result') return report.kind;
  if (report.value.errors.length) return 'fail';
  if (report.value.warnings.length) return 'warn';
  return 'pass';
}

export function Playground({ compact = false }: { compact?: boolean }) {
  const [raw, setRaw] = useState(BAD_SKILL);
  const [source, setSource] = useState<Source>('example');
  const [report, setReport] = useState<Report>({ kind: 'empty' });
  const [shareError, setShareError] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const lastTracked = useRef('');

  useEffect(() => {
    const shared = readShareState();
    if (shared.kind === 'ok') {
      setRaw(shared.value);
      setSource('shared');
    } else if (shared.kind === 'invalid') {
      setShareError(shared.reason === 'oversized'
        ? 'This shared skill is too large to open safely. Paste the file instead.'
        : 'This shared link is damaged. Paste the SKILL.md to continue.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!raw.trim()) {
        setReport({ kind: 'empty' });
        return;
      }
      try {
        setReport({ kind: 'result', value: lintSource(raw) });
      } catch (error) {
        setReport({ kind: 'parse', message: error instanceof Error ? error.message : String(error) });
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [raw]);

  const kind = reportKind(report);
  useEffect(() => {
    if (kind === 'empty') return;
    const key = `${kind}:${source}`;
    if (lastTracked.current === key) return;
    lastTracked.current = key;
    trackFunnel('playground_result', { result: kind, source });
  }, [kind, source]);

  const shareCard = useMemo(() => {
    const value = report.kind === 'result' ? report.value : { errors: [{}], warnings: [] };
    return buildShareCardUrl({ skillName: skillNameFrom(raw), ...value });
  }, [raw, report]);

  function loadExample(value: string) {
    setRaw(value);
    setSource('example');
    setShareError('');
  }

  async function loadFile(file?: File) {
    setDropActive(false);
    if (!file) return;
    if (file.size > 100_000) {
      setShareError('That file is over 100 KB. Open a normal SKILL.md file.');
      return;
    }
    setRaw(await file.text());
    setSource('file');
    setShareError('');
  }

  return (
    <div className={`${styles.playground} ${compact ? styles.compact : ''}`}>
      <div className={styles.toolbar}>
        <div>
          <strong>SKILL.md</strong>
          <span>evaluated locally</span>
        </div>
        <div className={styles.examples}>
          <button type="button" onClick={() => loadExample(GOOD_SKILL)}>Passing example</button>
          <button type="button" onClick={() => loadExample(BAD_SKILL)}>Broken example</button>
          <label>
            Open file
            <input type="file" accept=".md,text/markdown,text/plain" onChange={event => void loadFile(event.target.files?.[0])} />
          </label>
        </div>
      </div>

      {shareError && <div className={styles.shareError} role="alert">{shareError}</div>}
      <div className={styles.panes}>
        <div
          className={`${styles.editor} ${dropActive ? styles.dropActive : ''}`}
          onDragEnter={event => { event.preventDefault(); setDropActive(true); }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={() => setDropActive(false)}
          onDrop={event => { event.preventDefault(); void loadFile(event.dataTransfer.files[0]); }}
        >
          <textarea
            aria-label="SKILL.md source"
            spellCheck={false}
            value={raw}
            onChange={event => { setRaw(event.target.value); setSource('typed'); }}
          />
          {dropActive && <div className={styles.dropOverlay}>Drop SKILL.md here</div>}
        </div>

        <div className={styles.results} aria-live="polite" aria-atomic="true">
          {report.kind === 'empty' && <Empty />}
          {report.kind === 'parse' && <ParseError message={report.message} />}
          {report.kind === 'result' && <Results result={report.value} />}
        </div>
      </div>

      <div className={styles.footer}>
        <span>Static lint only. Real activation requires one local agent session.</span>
        <div>
          {!compact && raw.length < 12_000 && (
            <CopyButton
              className="button button-small"
              value={buildShareUrl(raw)}
              label="Copy share link"
              onCopy={() => history.replaceState(null, '', buildShareUrl(raw))}
            />
          )}
          {!compact && <a className="button button-small" href={shareCard} target="_blank" rel="noreferrer">Open result card ↗</a>}
          <Link className="button button-primary button-small" href="/setup">Run a real prompt →</Link>
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return <div className={styles.empty}><span>∅</span><strong>No skill loaded</strong><p>Paste a SKILL.md or open a local file.</p></div>;
}

function ParseError({ message }: { message: string }) {
  return <div className={styles.empty}><span className={styles.failIcon}>×</span><strong>Frontmatter could not be parsed</strong><p>{message}</p></div>;
}

function Results({ result }: { result: LintResult }) {
  const all = [...result.errors, ...result.warnings];
  const kind = result.errors.length ? 'fail' : result.warnings.length ? 'warn' : 'pass';
  const heading = kind === 'pass' ? 'Ready for a behavioral probe' : kind === 'warn' ? 'Passes with warnings' : 'Fix blockers before probing';
  return (
    <div className={styles.report}>
      <div className={`${styles.verdict} ${styles[kind]}`}>
        <span>{kind === 'pass' ? '✓' : kind === 'warn' ? '!' : '×'}</span>
        <div><strong>{heading}</strong><small>{result.errors.length} errors · {result.warnings.length} warnings</small></div>
      </div>
      {all.length === 0 ? (
        <p className={styles.clean}>The structure is sound. Now verify that a real agent routes the right prompts to it.</p>
      ) : (
        <ol className={styles.issueList}>
          {all.slice(0, 6).map((issue, index) => (
            <li key={`${issue.rule}-${index}`}>
              <span className={issue.level === 'error' ? styles.errorTag : styles.warningTag}>{issue.level}</span>
              <div><code>{issue.rule}</code><p>{issue.message}</p></div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
