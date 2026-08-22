import Link from 'next/link';
import type { ReactNode } from 'react';
import { TrackedLink } from './TrackedLink';

export function TripwireMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 24" aria-hidden="true">
      <path d="M1 12h30" stroke="currentColor" strokeWidth="1.25" opacity=".32" />
      <path d="M16 4v16" stroke="currentColor" strokeWidth="1.25" opacity=".2" />
      <circle cx="16" cy="12" r="4.25" fill="var(--signal)" />
      <circle cx="16" cy="12" r="8" fill="none" stroke="var(--signal)" strokeWidth="1" opacity=".2" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="site-header">
      <div className="page-width nav-inner">
        <Link className="brand" href="/" aria-label="Tripwire home">
          <TripwireMark />
          <span>tripwire</span>
        </Link>
        <nav className="nav-links" aria-label="Primary navigation">
          <Link className="nav-link" href="/playground">Playground</Link>
          <Link className="nav-link" href="/setup">Setup</Link>
          <Link className="nav-link" href="/security">Security</Link>
          <a className="nav-link" href="https://github.com/bharath31/tripwire" target="_blank" rel="noreferrer">Docs</a>
        </nav>
        <div className="nav-actions">
          <a className="nav-link" href="https://github.com/bharath31/tripwire" target="_blank" rel="noreferrer">GitHub ↗</a>
          <TrackedLink className="button button-primary button-small" href="/setup" location="header">
            Run a prompt
          </TrackedLink>
        </div>
      </div>
    </header>
  );
}

const columns: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Playground', href: '/playground' },
      { label: 'Setup', href: '/setup' },
      { label: 'Security', href: '/security' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'GitHub', href: 'https://github.com/bharath31/tripwire' },
      { label: 'npm', href: 'https://www.npmjs.com/package/tripwire-skills' },
      { label: 'GitHub Action', href: 'https://github.com/marketplace/actions/tripwire-for-agent-skills' },
    ],
  },
  {
    title: 'Details',
    links: [
      { label: 'Pricing', href: '/pricing.md' },
      { label: 'llms.txt', href: '/llms.txt' },
      { label: 'License', href: 'https://github.com/bharath31/tripwire/blob/main/LICENSE' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-width footer-inner">
        <div className="footer-brand">
          <Link className="brand" href="/"><TripwireMark /> tripwire</Link>
          <p className="footer-note">Behavioral regression tests for Agent Skills. Open source, local first, and built for CI.</p>
        </div>
        {columns.map(column => (
          <div className="footer-column" key={column.title}>
            <strong>{column.title}</strong>
            {column.links.map(link => link.href.startsWith('http') ? (
              <a href={link.href} target="_blank" rel="noreferrer" key={link.href}>{link.label} ↗</a>
            ) : (
              <Link href={link.href} key={link.href}>{link.label}</Link>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}

export function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="page-shell"><Header />{children}<Footer /></div>;
}
