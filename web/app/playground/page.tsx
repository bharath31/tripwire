import type { Metadata } from 'next';
import { PageFrame } from '@/components/SiteChrome';
import { Playground } from '@/components/Playground';
import styles from '../inner.module.css';

export const metadata: Metadata = {
  title: 'SKILL.md playground | Tripwire',
  description: 'Run Tripwire’s static SKILL.md checks locally in your browser, then continue to a real activation probe.',
};

export default function PlaygroundPage() {
  return (
    <PageFrame>
      <main className={`${styles.main} page-width`}>
        <header className={styles.hero}>
          <p className="eyebrow">Browser preflight</p>
          <h1>Inspect the file.<br />Then test the behavior.</h1>
          <p>Paste, edit, or drop a local SKILL.md. Nothing leaves this page. When the structure is ready, continue to one real agent prompt.</p>
        </header>
        <Playground />
      </main>
    </PageFrame>
  );
}
