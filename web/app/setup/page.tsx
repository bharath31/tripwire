import type { Metadata } from 'next';
import { PageFrame } from '@/components/SiteChrome';
import { SetupBuilder } from '@/components/SetupBuilder';
import styles from '../inner.module.css';

export const metadata: Metadata = {
  title: 'Run your first Tripwire test',
  description: 'Build one private local command, verify a real Agent Skill activation, and add the result to CI.',
};

export default function SetupPage() {
  return (
    <PageFrame>
      <main className={`${styles.main} page-width`}>
        <header className={styles.hero}>
          <p className="eyebrow">The easiest way to start</p>
          <h1>Test one prompt.<br />Know if the skill fired.</h1>
          <p>You do not need to install a GitHub App or create an account. Build one command here, run it from your repository, then add the workflow when you are ready.</p>
          <div className={styles.noteRow} aria-label="Setup properties"><span><i />About 3 minutes</span><span><i />Uses your agent login</span><span><i />Private by design</span></div>
        </header>
        <SetupBuilder />
      </main>
    </PageFrame>
  );
}
