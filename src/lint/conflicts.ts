import type { ParsedSkill } from '../types.js';

export interface SkillRef {
  name: string;
  description: string;
  filePath: string;
}

export interface NameCollision {
  name: string;
  files: string[];
}

export interface DescriptionOverlap {
  a: SkillRef;
  b: SkillRef;
  sharedTriggerWords: string[];
  score: number; // 0-1 Jaccard similarity over significant description words
}

export interface ConflictReport {
  nameCollisions: NameCollision[];
  descriptionOverlaps: DescriptionOverlap[];
}

// Words too generic to signal real trigger overlap between two skills —
// without this, nearly every "Use when ..." description would look related.
const STOPWORDS = new Set([
  'use', 'when', 'the', 'a', 'an', 'to', 'of', 'and', 'or', 'is', 'are', 'for', 'with',
  'this', 'that', 'in', 'on', 'it', 'you', 'your', 'be', 'by', 'as', 'at', 'from', 'want',
  'wants', 'or', 'if', 'any', 'also', 'has', 'have', 'will', 'not', 'do', 'does', 'can',
]);

function significantWords(description: string): Set<string> {
  const words = description
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: string[] } {
  const shared = [...a].filter((w) => b.has(w));
  const union = new Set([...a, ...b]);
  return { score: union.size === 0 ? 0 : shared.length / union.size, shared };
}

export function toSkillRef(skill: ParsedSkill): SkillRef | null {
  const name = skill.frontmatter.name;
  const description = skill.frontmatter.description;
  if (!name || !description) return null;
  return { name, description, filePath: skill.filePath };
}

export function findNameCollisions(refs: SkillRef[]): NameCollision[] {
  const byName = new Map<string, string[]>();
  for (const ref of refs) {
    const files = byName.get(ref.name) ?? [];
    files.push(ref.filePath);
    byName.set(ref.name, files);
  }
  return [...byName.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => ({ name, files }));
}

export function findDescriptionOverlaps(refs: SkillRef[], threshold = 0.3): DescriptionOverlap[] {
  const overlaps: DescriptionOverlap[] = [];
  const wordSets = refs.map((r) => significantWords(r.description));

  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const { score, shared } = jaccard(wordSets[i], wordSets[j]);
      if (score >= threshold && shared.length > 0) {
        overlaps.push({ a: refs[i], b: refs[j], sharedTriggerWords: shared.sort(), score });
      }
    }
  }

  return overlaps.sort((x, y) => y.score - x.score);
}

export function detectConflicts(skills: ParsedSkill[], threshold = 0.3): ConflictReport {
  const refs = skills.map(toSkillRef).filter((r): r is SkillRef => r !== null);
  return {
    nameCollisions: findNameCollisions(refs),
    descriptionOverlaps: findDescriptionOverlaps(refs, threshold),
  };
}
