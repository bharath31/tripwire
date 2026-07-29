type BehavioralCommand = 'analyze' | 'test' | 'test-all' | 'action';
type BehavioralOutcome = 'pass' | 'behavior_failure' | 'infrastructure_error';

interface EventPayload {
  event: 'behavioral_run_completed';
  installation_id: string;
  command: BehavioralCommand;
  agent: string;
  outcome: BehavioralOutcome;
  source: 'cli' | 'github_action';
  version: string;
}

interface AnalyticsDataset {
  writeDataPoint(point: {
    indexes: string[];
    blobs: string[];
    doubles: number[];
  }): void;
}

interface PagesContext {
  request: Request;
  env: {
    PRODUCT_ANALYTICS?: AnalyticsDataset;
  };
}

const COMMANDS = new Set<BehavioralCommand>(['analyze', 'test', 'test-all', 'action']);
const OUTCOMES = new Set<BehavioralOutcome>(['pass', 'behavior_failure', 'infrastructure_error']);
const SOURCES = new Set(['cli', 'github_action']);

function validPayload(value: unknown): value is EventPayload {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return event.event === 'behavioral_run_completed'
    && typeof event.installation_id === 'string'
    && /^[a-f0-9]{32}$/.test(event.installation_id)
    && typeof event.command === 'string'
    && COMMANDS.has(event.command as BehavioralCommand)
    && typeof event.agent === 'string'
    && /^[a-z-]{2,20}$/.test(event.agent)
    && typeof event.outcome === 'string'
    && OUTCOMES.has(event.outcome as BehavioralOutcome)
    && typeof event.source === 'string'
    && SOURCES.has(event.source)
    && typeof event.version === 'string'
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(event.version);
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  }

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!validPayload(payload)) return new Response('Invalid event', { status: 400 });

  context.env.PRODUCT_ANALYTICS?.writeDataPoint({
    indexes: [payload.installation_id],
    blobs: [
      payload.event,
      payload.command,
      payload.agent,
      payload.outcome,
      payload.version,
      payload.source,
    ],
    doubles: [1],
  });

  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' },
  });
};
