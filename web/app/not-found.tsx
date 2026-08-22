import Link from 'next/link';
import { PageFrame } from '@/components/SiteChrome';

export default function NotFound() {
  return (
    <PageFrame>
      <main className="page-width" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <p className="eyebrow">404 · No activation</p>
          <h1 className="section-heading">This route stayed quiet.</h1>
          <p className="section-intro" style={{ marginInline: 'auto', marginBottom: 28 }}>The page does not exist. Your skill test can still start from one real prompt.</p>
          <Link className="button button-primary" href="/setup">Run your first prompt →</Link>
        </div>
      </main>
    </PageFrame>
  );
}
