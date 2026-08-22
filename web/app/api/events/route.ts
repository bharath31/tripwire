import { neon } from '@neondatabase/serverless';
import { validEventPayload, type EventPayload } from '@/lib/events';

export const runtime = 'nodejs';
export const maxDuration = 10;

const MAX_BODY_BYTES = 2_048;

async function persist(payload: EventPayload): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  const sql = neon(databaseUrl);
  await sql`
    INSERT INTO behavioral_events (
      installation_id, event, command, agent, outcome, version, source
    ) VALUES (
      ${payload.installation_id}, ${payload.event}, ${payload.command}, ${payload.agent},
      ${payload.outcome}, ${payload.version}, ${payload.source}
    )
  `;
}

export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) return new Response('Invalid event', { status: 400 });

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return new Response('Invalid event', { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!validEventPayload(payload)) return new Response('Invalid event', { status: 400 });

  try {
    await persist(payload);
  } catch {
    return new Response('Event storage unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

function methodNotAllowed(): Response {
  return new Response('Method not allowed', { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
