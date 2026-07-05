import type { Rule } from './rule-types.js';

const WORKFLOW_PATTERNS = ['step 1', 'will then', 'first do', 'then it will'];
const PLACEHOLDER_PATTERNS = ['TBD', 'TODO', 'implement later', 'see task'];

export const namePresent: Rule = {
  id: 'name-present',
  defaultLevel: 'error',
  check: (skill) => (!skill.frontmatter.name ? '`name` field is missing from frontmatter' : null),
};

export const nameKebabCase: Rule = {
  id: 'name-kebab-case',
  defaultLevel: 'error',
  check: (skill) => {
    const name = skill.frontmatter.name;
    if (!name) return null; // covered by name-present
    return /^[a-z0-9-]+$/.test(name)
      ? null
      : `\`name\` must be kebab-case (letters, numbers, hyphens only), got: "${name}"`;
  },
};

export const descriptionPresent: Rule = {
  id: 'description-present',
  defaultLevel: 'error',
  check: (skill) => (!skill.frontmatter.description ? '`description` field is missing from frontmatter' : null),
};

export const descriptionUseWhen: Rule = {
  id: 'description-use-when',
  defaultLevel: 'error',
  check: (skill) => {
    const desc = skill.frontmatter.description;
    if (!desc) return null; // covered by description-present
    return desc.startsWith('Use when') ? null : '`description` must start with "Use when"';
  },
};

export const descriptionLength: Rule = {
  id: 'description-length',
  defaultLevel: 'error',
  check: (skill) => {
    const desc = skill.frontmatter.description;
    if (!desc) return null;
    return desc.length > 1024 ? `\`description\` is ${desc.length} chars (max 1024)` : null;
  },
};

export const descriptionNoWorkflow: Rule = {
  id: 'description-no-workflow',
  defaultLevel: 'error',
  check: (skill) => {
    const desc = skill.frontmatter.description;
    if (!desc) return null;
    const matched = WORKFLOW_PATTERNS.find((p) => desc.toLowerCase().includes(p));
    return matched ? `\`description\` contains workflow summary language: "${matched}"` : null;
  },
};

export const noPlaceholders: Rule = {
  id: 'no-placeholders',
  defaultLevel: 'warning',
  check: (skill) => {
    const lowerBody = skill.body.toLowerCase();
    const matched = PLACEHOLDER_PATTERNS.find((p) => lowerBody.includes(p.toLowerCase()));
    return matched ? `body contains placeholder text: "${matched}"` : null;
  },
};

export const noCommentBlocks: Rule = {
  id: 'no-comment-blocks',
  defaultLevel: 'warning',
  check: (skill) => {
    let consecutive = 0;
    for (const line of skill.body.split('\n')) {
      if (line.trimStart().startsWith('//')) {
        consecutive++;
        if (consecutive >= 3) return '3 or more consecutive comment lines found in body';
      } else {
        consecutive = 0;
      }
    }
    return null;
  },
};

export const bodyTooShort: Rule = {
  id: 'body-too-short',
  defaultLevel: 'warning',
  check: (skill) => {
    const wordCount = skill.body.split(/\s+/).filter(Boolean).length;
    return wordCount < 100 ? `body is ${wordCount} words (minimum 100)` : null;
  },
};

export const noCodeExample: Rule = {
  id: 'no-code-example',
  defaultLevel: 'warning',
  check: (skill) => {
    const hasCode = /`[^`\n]+`/.test(skill.body) || /```/.test(skill.body);
    return hasCode ? null : 'no code or command example found in body (add a backtick snippet or fenced block)';
  },
};

export const builtInRules: Rule[] = [
  namePresent,
  nameKebabCase,
  descriptionPresent,
  descriptionUseWhen,
  descriptionLength,
  descriptionNoWorkflow,
  noPlaceholders,
  noCommentBlocks,
  bodyTooShort,
  noCodeExample,
];
