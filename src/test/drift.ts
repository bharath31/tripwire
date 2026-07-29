export interface SkillDriftResult {
  skillName: string;
  filePath: string;
  gaps: number;
  falsePositives: number;
  infrastructureErrors?: number;
}

export interface SkippedSkill {
  filePath: string;
  reason: string;
}

export interface DriftSummary {
  checked: SkillDriftResult[];
  skipped: SkippedSkill[];
  hasDrift: boolean;
}

export function summarizeDrift(checked: SkillDriftResult[], skipped: SkippedSkill[]): DriftSummary {
  return {
    checked,
    skipped,
    hasDrift: checked.some(
      (r) => r.gaps > 0 || r.falsePositives > 0 || (r.infrastructureErrors ?? 0) > 0,
    ),
  };
}

export function renderDriftSummary(summary: DriftSummary): string {
  const lines: string[] = [];
  const drifted = summary.checked.filter(
    (r) => r.gaps > 0 || r.falsePositives > 0 || (r.infrastructureErrors ?? 0) > 0,
  );
  const clean = summary.checked.filter(
    (r) => r.gaps === 0 && r.falsePositives === 0 && (r.infrastructureErrors ?? 0) === 0,
  );

  lines.push(`Checked ${summary.checked.length} skill(s) with committed scenarios against the live model.`);
  lines.push('');

  if (drifted.length > 0) {
    lines.push(`✗ ${drifted.length} skill(s) drifted since their scenarios were last committed:`);
    for (const r of drifted) {
      const parts: string[] = [];
      if (r.gaps > 0) parts.push(`${r.gaps} gap${r.gaps === 1 ? '' : 's'}`);
      if (r.falsePositives > 0) parts.push(`${r.falsePositives} false positive${r.falsePositives === 1 ? '' : 's'}`);
      if ((r.infrastructureErrors ?? 0) > 0) {
        parts.push(
          `${r.infrastructureErrors} infrastructure error${r.infrastructureErrors === 1 ? '' : 's'}`,
        );
      }
      lines.push(`  - ${r.skillName} (${r.filePath}): ${parts.join(', ')}`);
    }
    lines.push('');
    lines.push('Re-run `tripwire analyze` for each drifted skill and commit the refreshed tripwire-scenarios.yaml.');
  } else if (clean.length > 0) {
    lines.push(`✓ No drift — all ${clean.length} skill(s) still match their committed scenarios.`);
  }

  if (summary.skipped.length > 0) {
    lines.push('');
    lines.push(`Skipped ${summary.skipped.length} skill(s) with no committed tripwire-scenarios.yaml:`);
    for (const s of summary.skipped) lines.push(`  - ${s.filePath}`);
  }

  return lines.join('\n');
}
