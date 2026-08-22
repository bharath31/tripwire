import type { Metadata } from 'next';
import { PageFrame } from '@/components/SiteChrome';
import styles from '../inner.module.css';

export const metadata: Metadata = {
  title: 'Security and privacy | Tripwire',
  description: 'How Tripwire isolates agent probes, handles credentials, and limits anonymous product telemetry.',
};

const cards = [
  {
    label: 'Probe isolation',
    title: 'Only the target skill enters the workspace.',
    body: 'Tripwire stages the skill under test in a disposable agent workspace, runs with a read-only or plan-mode boundary, and removes the workspace when the probe finishes.',
  },
  {
    label: 'Credentials',
    title: 'Your existing agent login stays where it belongs.',
    body: 'Local probes use the selected CLI’s authentication. CI secrets remain on your GitHub runner. Tripwire never proxies, stores, or logs provider credentials.',
  },
  {
    label: 'Browser data',
    title: 'The playground and setup builder are local.',
    body: 'Skill contents, file paths, prompts, repository URLs, and generated commands remain in browser memory or localStorage. They are not sent to Tripwire analytics.',
  },
  {
    label: 'Anonymous telemetry',
    title: 'Seven allowlisted fields, with an off switch.',
    body: 'Completed behavioral runs may report an anonymous installation hash, command, agent, outcome, source, version, and event name. Set TRIPWIRE_TELEMETRY=0 to disable it.',
  },
];

export default function SecurityPage() {
  return (
    <PageFrame>
      <main className={`${styles.main} page-width`}>
        <header className={styles.hero}>
          <p className="eyebrow">Security model</p>
          <h1>Behavioral evidence<br />without data custody.</h1>
          <p>Tripwire observes whether a skill activates. It does not need your prompts, repository, model output, or credentials to operate the product.</p>
        </header>
        <section className={styles.securityIntro}>
          <h2>Local by default is an architecture decision.</h2>
          <p>Agent Skills often contain internal workflows and codebase-specific instructions. Tripwire keeps the sensitive material with the developer and reduces hosted infrastructure to a narrow, documented telemetry endpoint.</p>
        </section>
        <section className={styles.securityGrid}>
          {cards.map(card => (
            <article className={styles.securityCard} key={card.label}>
              <span>{card.label}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </section>
        <div className={styles.securityFooter}>
          <p>Found a vulnerability? Follow the private reporting instructions in the repository security policy. Do not open a public issue with exploit details.</p>
          <a className="button button-primary" href="https://github.com/bharath31/tripwire/security/policy" target="_blank" rel="noreferrer">Read the security policy ↗</a>
        </div>
      </main>
    </PageFrame>
  );
}
