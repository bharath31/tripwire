import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '../../schemas/tripwire-review-annotation-v1.schema.json');
const guidePath = join(here, '../../docs/review-annotation-guide.md');

describe('review annotation contract', () => {
  it('publishes a closed, versioned schema with the evidence and review labels', async () => {
    const schema = JSON.parse(await readFile(schemaPath, 'utf-8')) as Record<string, any>;

    expect(schema.$schema).toContain('2020-12');
    expect(schema.properties.schemaVersion.const).toBe('1.0');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.rawTranscriptContentExcluded.const).toBe(true);
    expect(schema.$defs.annotation.properties.findingType.enum).toEqual([
      'recurrence', 'retry_chain', 'legitimate_repeat', 'mutation_boundary', 'no_finding',
    ]);
    expect(schema.$defs.reviewerLabel.properties.observation.enum).toContain('unsupported');
    expect(schema.$defs.reviewerLabel.properties.recommendedAction.enum).toEqual([
      'skill', 'project_instruction', 'investigate_workflow', 'none',
    ]);
    expect(schema.$defs.annotation.properties.outcomeCertainty.enum).toContain('unknown');
    expect(schema.$defs.annotation.properties.reviewers.minItems).toBe(2);
    expect(schema.$defs.reviewProcess.properties.independentReviewerCount.minimum).toBe(2);
  });

  it('makes provenance, consent, and sanitization explicit', async () => {
    const schema = JSON.parse(await readFile(schemaPath, 'utf-8')) as Record<string, any>;
    const provenance = schema.$defs.provenance;

    expect(provenance.required).toEqual(expect.arrayContaining([
      'sourceKind', 'consentStatus', 'sanitizationStatus', 'relationshipPreserved',
    ]));
    expect(provenance.properties.sourceKind.enum).toEqual([
      'consented-real', 'source-verified', 'synthetic',
    ]);
    expect(JSON.stringify(provenance)).toContain('affirmative');
    expect(JSON.stringify(provenance)).toContain('human-reviewed');
  });

  it('documents positive, negative, ambiguous, and synthetic-only limitations', async () => {
    const guide = await readFile(guidePath, 'utf-8');

    expect(guide).toContain('Two independent passes');
    expect(guide).toContain('different read ranges');
    expect(guide).toContain('read after edit');
    expect(guide).toContain('Ambiguous custom tool');
    expect(guide).toContain('Unsupported signal');
    expect(guide).toContain('do **not** establish real-run representativeness');
    expect(guide).toContain('Do not label work “waste.”');
  });
});
