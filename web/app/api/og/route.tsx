import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';

type Status = 'pass' | 'warn' | 'fail';

function paramsFrom(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawStatus = params.get('status');
  const status: Status = rawStatus === 'fail' || rawStatus === 'warn' ? rawStatus : 'pass';
  const errors = Math.max(0, Number.parseInt(params.get('errors') || '0', 10) || 0);
  const warnings = Math.max(0, Number.parseInt(params.get('warnings') || '0', 10) || 0);
  return {
    hasResult: params.has('skill') || params.has('status'),
    skill: (params.get('skill') || 'skill').replace(/[<>]/g, '').slice(0, 60),
    status,
    errors,
    warnings,
  };
}

export function GET(request: Request) {
  const data = paramsFrom(request);
  const color = data.status === 'fail' ? '#E5484D' : data.status === 'warn' ? '#A56618' : '#237A52';
  const verdict = data.status === 'fail'
    ? `${data.errors} error${data.errors === 1 ? '' : 's'} · CI would fail`
    : data.status === 'warn'
      ? `${data.warnings} warning${data.warnings === 1 ? '' : 's'} · review recommended`
      : 'No structural issues · ready to probe';

  return new ImageResponse(
    <div style={{ width: 1200, height: 630, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 70, color: '#151817', background: '#F6F7F4', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, fontWeight: 600 }}>
        <div style={{ display: 'flex', position: 'relative', width: 38, height: 20, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', position: 'absolute', width: 38, height: 1, background: '#151817', opacity: 0.28 }} />
          <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 20, background: '#E5484D' }} />
        </div>
        tripwire
      </div>
      {data.hasResult ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', color: '#656B67', fontSize: 18, letterSpacing: 3, textTransform: 'uppercase' }}>SKILL.md preflight</div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: 66, fontWeight: 600, letterSpacing: -3 }}>{data.skill}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 30, padding: '22px 28px', border: '1px solid rgba(21,24,23,.2)', borderRadius: 10, background: '#FFFFFF' }}>
            <div style={{ display: 'flex', width: 18, height: 18, borderRadius: 20, background: color }} />
            <div style={{ display: 'flex', color, fontSize: 27, fontWeight: 600 }}>{verdict}</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', color: '#E5484D', fontSize: 18, letterSpacing: 3, textTransform: 'uppercase' }}>Behavioral regression tests</div>
          <div style={{ display: 'flex', marginTop: 20, fontSize: 76, fontWeight: 600, letterSpacing: -4, lineHeight: 1 }}>Ship skills that fire on cue.</div>
          <div style={{ display: 'flex', marginTop: 25, color: '#626864', fontSize: 27 }}>One real prompt. One observed activation. One CI gate.</div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 22, borderTop: '1px solid rgba(21,24,23,.2)', color: '#747A76', fontSize: 18 }}>
        <span>tripwire.bharath.sh</span><span>open source · local first</span>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { 'cache-control': 'public, max-age=300, s-maxage=300' } },
  );
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300, s-maxage=300' } });
}
