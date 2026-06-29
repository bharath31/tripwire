export interface SkillFrontmatter {
  name: string;
  description: string;
  [key: string]: unknown;
}

export interface ParsedSkill {
  frontmatter: Partial<SkillFrontmatter>;
  body: string;
  filePath: string;
}

export interface Config {
  agent: string;
  model: string;
  judge_model: string;
  thresholds: { core_activation: number; false_positive_rate: number };
  probe_count: { core: number; adjacent: number; negative: number; variants: number };
}

export interface LintError {
  level: 'error' | 'warning';
  rule: string;
  message: string;
}

export interface LintResult {
  errors: LintError[];
  warnings: LintError[];
}

export type ProbeZone = 'core' | 'adjacent' | 'negative' | 'variants';

export interface ProbePrompt {
  zone: ProbeZone;
  prompt: string;
}

export interface ProbeMatrix {
  skillName: string;
  prompts: ProbePrompt[];
}

export interface TranscriptResult {
  activated: boolean;
  skillName?: string;
  rawOutput: string;
}

export interface JudgeResult {
  score: number;
  violations: string[];
}

export interface ProbeResult {
  prompt: ProbePrompt;
  transcript: TranscriptResult;
  judge?: JudgeResult;
}

export interface CoverageReport {
  skillName: string;
  lintResult: LintResult;
  results: ProbeResult[];
  zones: Record<ProbeZone, { activated: number; total: number }>;
  qualityScore: number;
  gaps: ProbeResult[];
  falsePositives: ProbeResult[];
  suggestions: string[];
}

export interface Scenario {
  prompt: string;
  zone: ProbeZone;
  expectedActivation: boolean;
}

export interface ScenariosFile {
  skillName: string;
  generatedAt: string;
  scenarios: Scenario[];
}

export interface AgentAdapter {
  run(prompt: string): Promise<TranscriptResult>;
}
