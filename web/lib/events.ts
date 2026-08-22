export type BehavioralCommand = 'analyze' | 'test' | 'test-all' | 'action';
export type BehavioralOutcome = 'pass' | 'behavior_failure' | 'infrastructure_error';

export interface EventPayload {
  event: 'behavioral_run_completed';
  installation_id: string;
  command: BehavioralCommand;
  agent: string;
  outcome: BehavioralOutcome;
  source: 'cli' | 'github_action';
  version: string;
}

const COMMANDS = new Set<BehavioralCommand>(['analyze', 'test', 'test-all', 'action']);
const OUTCOMES = new Set<BehavioralOutcome>(['pass', 'behavior_failure', 'infrastructure_error']);
const SOURCES = new Set(['cli', 'github_action']);

export function validEventPayload(value: unknown): value is EventPayload {
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
