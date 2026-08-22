'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, color: '#151817', background: '#F6F7F4', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
          <div>
            <p style={{ color: '#E5484D', fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Runtime interruption</p>
            <h1 style={{ maxWidth: 620, margin: '16px auto', fontSize: 52, lineHeight: 1 }}>Tripwire could not render this page.</h1>
            <p style={{ maxWidth: 520, margin: '0 auto 24px', color: '#626864' }}>Your local skill, prompt, and setup state were not sent anywhere. Retry the page to continue.</p>
            <button type="button" onClick={reset} style={{ minHeight: 42, padding: '0 18px', border: 0, borderRadius: 8, color: '#fff', background: '#151817', fontWeight: 650, cursor: 'pointer' }}>Retry page</button>
          </div>
        </main>
      </body>
    </html>
  );
}
