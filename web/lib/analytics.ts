'use client';

import { track } from '@vercel/analytics';

type FunnelEvent =
  | 'cta_clicked'
  | 'playground_result'
  | 'setup_started'
  | 'setup_command_copied'
  | 'setup_outcome_reported';

export function trackFunnel(event: FunnelEvent, data: Record<string, string>): void {
  if (process.env.NODE_ENV === 'test') return;
  const safeData = Object.fromEntries(Object.entries(data).slice(0, 2));
  track(event, safeData);
}
