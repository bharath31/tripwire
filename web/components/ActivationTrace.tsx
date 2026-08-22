'use client';

import { useState } from 'react';
import styles from './ActivationTrace.module.css';

type Result = 'fired' | 'missed' | 'false trigger' | 'stayed quiet';

interface Case {
  id: string;
  prompt: string;
  expectation: 'activate' | 'quiet';
  observed: 'activated' | 'quiet';
  result: Result;
  detail: string;
  tone: 'pass' | 'fail';
}

const cases: Case[] = [
  {
    id: 'core',
    prompt: 'Review this API route for unsafe error handling',
    expectation: 'activate',
    observed: 'activated',
    result: 'fired',
    detail: 'The agent emitted a structured skill activation event for api-error-handler.',
    tone: 'pass',
  },
  {
    id: 'adjacent',
    prompt: 'Make failures from this endpoint predictable',
    expectation: 'activate',
    observed: 'quiet',
    result: 'missed',
    detail: 'The intent matched the skill, but the description did not route the agent to it.',
    tone: 'fail',
  },
  {
    id: 'negative',
    prompt: 'Rewrite the empty state on this settings screen',
    expectation: 'quiet',
    observed: 'activated',
    result: 'false trigger',
    detail: 'The skill activated for unrelated work. Narrow the description before release.',
    tone: 'fail',
  },
  {
    id: 'control',
    prompt: 'Add a keyboard shortcut for search',
    expectation: 'quiet',
    observed: 'quiet',
    result: 'stayed quiet',
    detail: 'The agent correctly left this skill out of an unrelated session.',
    tone: 'pass',
  },
];

export function ActivationTrace() {
  const [activeId, setActiveId] = useState(cases[1].id);
  const active = cases.find(item => item.id === activeId) ?? cases[0];

  return (
    <section className={styles.panel} aria-labelledby="trace-title">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>Example probe · api-error-handler</p>
          <h2 id="trace-title">Activation record</h2>
        </div>
        <span className={styles.session}><i /> observed event</span>
      </div>

      <div className={styles.labels} aria-hidden="true">
        <span>Prompt</span><span>Expected</span><span>Observed</span><span>Verdict</span>
      </div>
      <div className={styles.rows} role="list" aria-label="Example activation cases">
        {cases.map(item => (
          <button
            className={`${styles.row} ${activeId === item.id ? styles.active : ''}`}
            key={item.id}
            type="button"
            onClick={() => setActiveId(item.id)}
            aria-pressed={activeId === item.id}
          >
            <span className={styles.prompt}>{item.prompt}</span>
            <span className={styles.expectation}>{item.expectation}</span>
            <span className={styles.observed}>{item.observed}</span>
            <span className={`${styles.verdict} ${styles[item.tone]}`}><i />{item.result}</span>
          </button>
        ))}
      </div>

      <div className={`${styles.detail} ${styles[active.tone]}`} aria-live="polite">
        <div className={styles.detailMark} aria-hidden="true">{active.tone === 'pass' ? '✓' : '×'}</div>
        <div>
          <span className={styles.detailLabel}>{active.result}</span>
          <p>{active.detail}</p>
        </div>
      </div>
      <p className={styles.caption}>Representative output. Your probes run locally through the selected agent CLI.</p>
    </section>
  );
}
