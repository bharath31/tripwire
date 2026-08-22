import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const display = Instrument_Sans({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '600'], display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500', '600'], display: 'swap' });

const title = 'Tripwire: behavioral tests for Agent Skills';
const description = 'Run real agent sessions against prompts that should and should not activate your SKILL.md, then gate regressions in CI.';

export const metadata: Metadata = {
  metadataBase: new URL('https://tripwire.bharath.sh'),
  title,
  description,
  alternates: { canonical: '/', types: { 'text/plain': '/llms.txt' } },
  openGraph: {
    title,
    description,
    type: 'website',
    url: '/',
    siteName: 'Tripwire',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'Tripwire, behavioral tests for Agent Skills' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/api/og'] },
  icons: { icon: '/icon.svg' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
