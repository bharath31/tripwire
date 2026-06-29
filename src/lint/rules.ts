import type { ParsedSkill, LintError, LintResult } from '../types.js';

const WORKFLOW_PATTERNS = ['step 1', 'will then', 'first do', 'then it will'];
const PLACEHOLDER_PATTERNS = ['TBD', 'TODO', 'implement later', 'see task'];

export function lint(skill: ParsedSkill): LintResult {
  const errors: LintError[] = [];
  const warnings: LintError[] = [];

  // Errors
  if (!skill.frontmatter.name) {
    errors.push({ level: 'error', rule: 'name-present', message: '`name` field is missing from frontmatter' });
  } else if (!/^[a-z0-9-]+$/.test(skill.frontmatter.name)) {
    errors.push({ level: 'error', rule: 'name-kebab-case', message: `\`name\` must be kebab-case (letters, numbers, hyphens only), got: "${skill.frontmatter.name}"` });
  }

  if (!skill.frontmatter.description) {
    errors.push({ level: 'error', rule: 'description-present', message: '`description` field is missing from frontmatter' });
  } else {
    const desc = skill.frontmatter.description;

    if (!desc.startsWith('Use when')) {
      errors.push({ level: 'error', rule: 'description-use-when', message: '`description` must start with "Use when"' });
    }

    if (desc.length > 1024) {
      errors.push({ level: 'error', rule: 'description-length', message: `\`description\` is ${desc.length} chars (max 1024)` });
    }

    const lowerDesc = desc.toLowerCase();
    const matchedWorkflow = WORKFLOW_PATTERNS.find(p => lowerDesc.includes(p));
    if (matchedWorkflow) {
      errors.push({ level: 'error', rule: 'description-no-workflow', message: `\`description\` contains workflow summary language: "${matchedWorkflow}"` });
    }
  }

  // Warnings
  const lowerBody = skill.body.toLowerCase();
  const matchedPlaceholder = PLACEHOLDER_PATTERNS.find(p => lowerBody.includes(p.toLowerCase()));
  if (matchedPlaceholder) {
    warnings.push({ level: 'warning', rule: 'no-placeholders', message: `body contains placeholder text: "${matchedPlaceholder}"` });
  }

  const lines = skill.body.split('\n');
  let consecutiveComments = 0;
  let commentBlockFlagged = false;
  for (const line of lines) {
    if (line.trimStart().startsWith('//')) {
      consecutiveComments++;
      if (consecutiveComments >= 3 && !commentBlockFlagged) {
        warnings.push({ level: 'warning', rule: 'no-comment-blocks', message: '3 or more consecutive comment lines found in body' });
        commentBlockFlagged = true;
      }
    } else {
      consecutiveComments = 0;
    }
  }

  const wordCount = skill.body.split(/\s+/).filter(Boolean).length;
  if (wordCount < 100) {
    warnings.push({ level: 'warning', rule: 'body-too-short', message: `body is ${wordCount} words (minimum 100)` });
  }

  const hasCode = /`[^`\n]+`/.test(skill.body) || /```/.test(skill.body);
  if (!hasCode) {
    warnings.push({ level: 'warning', rule: 'no-code-example', message: 'no code or command example found in body (add a backtick snippet or fenced block)' });
  }

  return { errors, warnings };
}
