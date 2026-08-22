import { ActivationTrace } from '@/components/ActivationTrace';
import { ArrowIcon, PageFrame } from '@/components/SiteChrome';
import { Playground } from '@/components/Playground';
import { TrackedLink } from '@/components/TrackedLink';
import styles from './home.module.css';

const workflow = `name: Tripwire
on: pull_request
jobs:
  skills:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }
      - uses: bharath31/tripwire@v1`;

const faq = [
  {
    question: 'How is this different from a SKILL.md linter?',
    answer: 'A linter checks structure and authoring rules. Tripwire also opens a real agent session and observes whether the skill activates. That catches valid-looking descriptions that miss intended prompts or fire for unrelated work.',
  },
  {
    question: 'Do I install a GitHub App?',
    answer: 'No. A GitHub Action is a workflow file in your repository. The setup guide prepares that file for you to review and commit on GitHub, or you can create it locally with tripwire init.',
  },
  {
    question: 'Does Tripwire upload my skill or prompts?',
    answer: 'No. Browser lint runs in the page. Behavioral probes run through your agent CLI on your machine or GitHub runner. Anonymous telemetry contains only the command, agent, outcome, source, and version, and can be disabled.',
  },
  {
    question: 'Which agents work today?',
    answer: 'Claude Code activation detection is live verified. Codex CLI and Gemini CLI adapters are available but explicitly marked experimental.',
  },
];

export default function HomePage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Tripwire',
        alternateName: 'tripwire-skills',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'macOS, Linux, Windows',
        isAccessibleForFree: true,
        url: 'https://tripwire.bharath.sh/',
        downloadUrl: 'https://www.npmjs.com/package/tripwire-skills',
        codeRepository: 'https://github.com/bharath31/tripwire',
        license: 'https://opensource.org/license/mit',
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map(item => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  };

  return (
    <PageFrame>
      <main>
        <section className={`${styles.hero} page-width`}>
          <div className={styles.heroCopy}>
            <p className="eyebrow">Behavioral regression tests for Agent Skills</p>
            <h1>Ship skills that<br /><span>fire on cue.</span></h1>
            <p className={styles.heroLede}>Tripwire runs real agent sessions against prompts that should and shouldn’t activate your SKILL.md, then turns those cases into a CI gate.</p>
            <div className={styles.heroActions}>
              <TrackedLink className="button button-primary" href="/setup" location="hero_primary">
                Run your first prompt <ArrowIcon />
              </TrackedLink>
              <TrackedLink className="button" href="/playground" location="hero_secondary">Try browser lint</TrackedLink>
            </div>
            <ul className={styles.trustList} aria-label="Product trust facts">
              <li><i />Open source</li>
              <li><i />No account</li>
              <li><i />Runs locally</li>
              <li><i />Prompts stay private</li>
            </ul>
          </div>
          <div className={styles.heroInstrument}>
            <ActivationTrace />
          </div>
        </section>

        <section className={`${styles.proof} page-width`} aria-label="Corpus scan results">
          <div><strong>200</strong><span>public skills scanned</span></div>
          <div><strong>96%</strong><span>fail a best-practice lint</span></div>
          <div><strong>93%</strong><span>lack explicit “Use when” routing</span></div>
          <a href="https://github.com/bharath31/tripwire/tree/main/scripts/corpus-scan" target="_blank" rel="noreferrer">Reproduce the scan ↗</a>
        </section>

        <section className={`${styles.problem} page-width`}>
          <div className={styles.problemStatement}>
            <p className="eyebrow">The silent failure</p>
            <h2 className="section-heading">Valid YAML is not verified behavior.</h2>
          </div>
          <div className={styles.problemDetails}>
            <p>An agent treats your skill description as routing code. A file can pass every structural check and still miss “help me make this endpoint safer” because the description only mentions “error handling.”</p>
            <div className={styles.failurePair}>
              <div><span>01 / missed activation</span><strong>The right user asks. The skill stays quiet.</strong></div>
              <div><span>02 / false trigger</span><strong>An unrelated request loads the wrong instructions.</strong></div>
            </div>
          </div>
        </section>

        <section className={`${styles.playgroundSection} page-width`}>
          <div className={styles.sectionTop}>
            <div><p className="eyebrow">Static preflight</p><h2 className="section-heading">Check the file before you probe it.</h2></div>
            <p>Paste or drop a SKILL.md. The exact CLI lint engine runs in your browser, with no upload and no account.</p>
          </div>
          <Playground compact />
        </section>

        <section className={`${styles.workflow} page-width`}>
          <div className={styles.sectionTop}>
            <div><p className="eyebrow">The shortest path to confidence</p><h2 className="section-heading">One prompt. Then a contract. Then CI.</h2></div>
            <p>Start with the behavior you understand. Expand only after the first real verdict proves the setup works.</p>
          </div>
          <ol className={styles.steps}>
            <li><span>01</span><div><code>tripwire test</code><h3>Verify one real prompt</h3><p>Use your existing agent login. No generation key, account, or global install.</p></div></li>
            <li><span>02</span><div><code>tripwire analyze</code><h3>Map the routing boundary</h3><p>Generate positive, adjacent, negative, and paraphrased cases for review.</p></div></li>
            <li><span>03</span><div><code>tripwire init</code><h3>Gate every skill change</h3><p>Commit the scenarios and one workflow file. Regressions fail the pull request.</p></div></li>
          </ol>
          <TrackedLink className="button button-primary" href="/setup" location="workflow">Build my first command <ArrowIcon /></TrackedLink>
        </section>

        <section className={`${styles.ci} page-width`}>
          <div className={styles.ciCopy}>
            <p className="eyebrow">GitHub-native handoff</p>
            <h2 className="section-heading">The Action is a file, not another account.</h2>
            <p className="section-intro">Paste a repository URL in setup. Tripwire prepares GitHub’s file editor with the workflow, ready for you to review and commit. Start with free static checks, then enable behavioral probes after your scenarios exist.</p>
            <ul>
              <li><span>✓</span>Checks changed SKILL.md files</li>
              <li><span>✓</span>Annotates the exact lines on the diff</li>
              <li><span>✓</span>Posts one updated pull request summary</li>
              <li><span>✓</span>Keeps provider keys on your runner</li>
            </ul>
            <TrackedLink className="button button-primary" href="/setup#github" location="ci">Add to GitHub</TrackedLink>
          </div>
          <div className={styles.workflowFile}>
            <div><span>.github/workflows/tripwire.yml</span><span>review before commit</span></div>
            <pre><code>{workflow}</code></pre>
          </div>
        </section>

        <section className={`${styles.faq} page-width`}>
          <div><p className="eyebrow">Straight answers</p><h2 className="section-heading">Before you run it.</h2></div>
          <div className={styles.faqList}>
            {faq.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>{item.question}<span>+</span></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={`${styles.finalCta} page-width`}>
          <p className="eyebrow">No account · about three minutes</p>
          <h2>Give one prompt<br />a real pass or fail.</h2>
          <TrackedLink className="button button-signal" href="/setup" location="final_cta">Run your first prompt <ArrowIcon /></TrackedLink>
        </section>
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </PageFrame>
  );
}
