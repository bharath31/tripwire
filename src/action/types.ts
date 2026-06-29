import type { LintResult, ProbeResult, ProbeZone } from '../types.js';

export interface Regression {
  prompt: string;
  zone: ProbeZone;
  kind: 'gap' | 'false-positive';
}

export interface SkillProbeResult {
  skillName: string;
  results: ProbeResult[];
  regressions: Regression[];
}

export interface SkillReport {
  skillName: string;
  file: string;
  lint: LintResult;
  probe?: SkillProbeResult;
  probeSkipped?: string;
}
