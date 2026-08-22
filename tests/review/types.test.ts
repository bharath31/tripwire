import { describe, expect, it } from 'vitest';
import {
  REVIEW_SCHEMA_VERSION,
  unavailableCapabilities,
  type NormalizedSession,
} from '../../src/review/types.js';

describe('normalized review contracts', () => {
  it('round-trips explicit unknowns and session boundaries through JSON', () => {
    const session: NormalizedSession = {
      schemaVersion: REVIEW_SCHEMA_VERSION,
      sessionId: 'segment-2',
      logicalSessionId: 'logical-1',
      segmentId: 'segment-2',
      continuedFromSessionId: 'segment-1',
      source: { id: 'source-2', path: '/local/run.jsonl', sizeBytes: 42, modifiedAt: null },
      project: { id: null, root: null, source: 'unknown', confidence: 'low' },
      adapter: {
        harness: 'openai',
        adapterVersion: '1',
        format: 'chat-completions-jsonl',
        formatVersion: null,
        detectionConfidence: 'medium',
        capabilities: {
          ...unavailableCapabilities(),
          toolCalls: 'structured',
          toolResults: 'heuristic',
        },
      },
      startedAt: null,
      endedAt: null,
      usage: { inputTokens: null, outputTokens: null, cachedInputTokens: null },
      events: [{
        id: 'event-1',
        sequence: 0,
        timestamp: null,
        kind: 'tool',
        toolName: 'custom_lookup',
        input: { id: 7 },
        callId: null,
        signature: {
          version: '1',
          digest: 'abc',
          canonical: '{}',
          display: 'custom_lookup',
          subject: 'custom_lookup',
          operationKind: 'unknown',
          confidence: 'low',
        },
        outcome: 'unknown',
        result: { sizeBytes: null, fingerprint: null },
        operation: 'unknown',
        operationConfidence: 'low',
        state: { epoch: 0, subject: null, confidence: 'low' },
        activation: null,
        evidence: {
          sourceId: 'source-2',
          sessionId: 'segment-2',
          eventId: 'event-1',
          sequence: 0,
          line: 3,
        },
        resultEvidence: null,
      }],
      diagnostics: [{
        code: 'unsupported-signal',
        severity: 'warning',
        message: 'Outcome unavailable in this format.',
        line: 3,
      }],
      stats: {
        recordsSeen: 3,
        invalidRecords: 0,
        unsupportedRecords: 1,
        toolEventsSeen: 1,
        retainedEvents: 1,
        droppedEvents: 0,
      },
    };

    expect(JSON.parse(JSON.stringify(session))).toEqual(session);
    expect(session.events[0].outcome).toBe('unknown');
    expect(session.logicalSessionId).not.toBe(session.segmentId);
  });

  it('returns a fresh, fully explicit unavailable capability declaration', () => {
    const first = unavailableCapabilities();
    const second = unavailableCapabilities();
    first.toolCalls = 'structured';

    expect(second).toEqual({
      toolCalls: 'unavailable',
      toolResults: 'unavailable',
      timestamps: 'unavailable',
      usage: 'unavailable',
      mutations: 'unavailable',
      skillActivation: 'unavailable',
    });
  });
});
