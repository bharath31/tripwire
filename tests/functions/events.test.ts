import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../functions/api/events.js';

const validEvent = {
  event: 'behavioral_run_completed',
  installation_id: 'a'.repeat(32),
  command: 'test',
  agent: 'claude',
  outcome: 'pass',
  source: 'cli',
  version: '0.1.2',
} as const;

function context(body: unknown, writeDataPoint = vi.fn()) {
  return {
    request: new Request('https://tripwire.bharath.sh/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { PRODUCT_ANALYTICS: { writeDataPoint } },
  };
}

describe('/api/events', () => {
  it('records an allowlisted behavioral event', async () => {
    const writeDataPoint = vi.fn();
    const response = await onRequest(context(validEvent, writeDataPoint));
    expect(response.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: [validEvent.installation_id],
      blobs: [
        validEvent.event,
        validEvent.command,
        validEvent.agent,
        validEvent.outcome,
        validEvent.version,
        validEvent.source,
      ],
      doubles: [1],
    });
  });

  it('rejects invalid or expanded payloads', async () => {
    const writeDataPoint = vi.fn();
    const response = await onRequest(context({ ...validEvent, prompt: 'private prompt' }, writeDataPoint));
    expect(response.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(writeDataPoint.mock.calls[0])).not.toContain('private prompt');
  });

  it('returns 400 for an invalid identity', async () => {
    const response = await onRequest(context({ ...validEvent, installation_id: 'raw-machine-name' }));
    expect(response.status).toBe(400);
  });

  it('returns 204 when the optional dataset binding is not configured', async () => {
    const response = await onRequest({
      request: context(validEvent).request,
      env: {},
    });
    expect(response.status).toBe(204);
  });
});
