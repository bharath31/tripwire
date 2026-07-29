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

function database(run = vi.fn().mockResolvedValue({ success: true })) {
  const statement = {
    bind: vi.fn(),
    run,
  };
  statement.bind.mockReturnValue(statement);
  return {
    prepare: vi.fn().mockReturnValue(statement),
    statement,
  };
}

function context(body: unknown, productAnalytics = database()) {
  return {
    request: new Request('https://tripwire.bharath.sh/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { PRODUCT_ANALYTICS: productAnalytics },
  };
}

describe('/api/events', () => {
  it('records an allowlisted behavioral event', async () => {
    const productAnalytics = database();
    const response = await onRequest(context(validEvent, productAnalytics));
    expect(response.status).toBe(204);
    expect(productAnalytics.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO behavioral_events'),
    );
    expect(productAnalytics.statement.bind).toHaveBeenCalledWith(
      validEvent.installation_id,
      validEvent.event,
      validEvent.command,
      validEvent.agent,
      validEvent.outcome,
      validEvent.version,
      validEvent.source,
    );
    expect(productAnalytics.statement.run).toHaveBeenCalledOnce();
  });

  it('rejects invalid or expanded payloads', async () => {
    const productAnalytics = database();
    const response = await onRequest(context({ ...validEvent, prompt: 'private prompt' }, productAnalytics));
    expect(response.status).toBe(204);
    expect(productAnalytics.statement.run).toHaveBeenCalledOnce();
    expect(JSON.stringify(productAnalytics.statement.bind.mock.calls[0])).not.toContain('private prompt');
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

  it('returns 503 when the event cannot be persisted', async () => {
    const productAnalytics = database(vi.fn().mockRejectedValue(new Error('D1 unavailable')));
    const response = await onRequest(context(validEvent, productAnalytics));
    expect(response.status).toBe(503);
  });
});
