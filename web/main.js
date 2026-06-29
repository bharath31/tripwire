import { lintSource } from './engine.js';

const EXAMPLES = {
  good: `---
name: api-error-handler
description: Use when adding or reviewing error handling in API route handlers in this codebase
---

## When to use

Reach for this when a route handler talks to the database, an external
service, or the file system and could throw. Every handler in this project
wraps its body in the shared \`withErrors()\` helper so failures become
structured JSON responses instead of unhandled rejections.

## How to apply

Wrap the handler and map known failures to status codes:

\`\`\`ts
export const POST = withErrors(async (req) => {
  const body = await parse(req);
  const row = await db.insert(body);
  return json(row, 201);
});
\`\`\`

Unknown errors become a 500 with a request id. Never swallow an error
silently, and never leak a stack trace to the client. If you add a new
failure category, register its status code in \`error-map.ts\` so the whole
codebase stays consistent and the responses remain predictable for callers.`,

  bad: `---
name: MyHelper
description: This helper does stuff. Step 1 is to set things up.
---

## Notes

TODO: write this properly.

Run the thing and it works.`,
};

const input = document.getElementById('pg-input');
const output = document.getElementById('pg-output');

function iconFor(level) {
  return level === 'error' ? '✗' : '⚠';
}

function render(result) {
  const { errors, warnings } = result;
  const parts = [];

  if (errors.length === 0 && warnings.length === 0) {
    parts.push(`<div class="verdict pass"><span>✓</span> No issues found — this skill passes every rule.</div>`);
  } else if (errors.length > 0) {
    const e = `${errors.length} error${errors.length > 1 ? 's' : ''}`;
    const w = warnings.length > 0 ? `, ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : '';
    parts.push(`<div class="verdict fail"><span>✗</span> ${e}${w} — CI would fail on this skill.</div>`);
  } else {
    const w = `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`;
    parts.push(`<div class="verdict warn"><span>⚠</span> ${w} — passes CI, but worth a look.</div>`);
  }

  for (const f of [...errors, ...warnings]) {
    parts.push(
      `<div class="finding ${f.level}">` +
        `<span class="icon">${iconFor(f.level)}</span>` +
        `<span class="finding-body"><span class="rule">${escapeHtml(f.rule)}</span>` +
        `<span class="msg">${escapeHtml(f.message)}</span></span>` +
      `</div>`,
    );
  }

  output.innerHTML = parts.join('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function lintNow() {
  const raw = input.value;
  if (raw.trim() === '') {
    output.innerHTML = `<div class="empty">Paste a SKILL.md above to see lint results.</div>`;
    return;
  }
  try {
    render(lintSource(raw));
  } catch (err) {
    output.innerHTML = `<div class="verdict fail"><span>✗</span> Could not parse: ${escapeHtml(String(err))}</div>`;
  }
}

input.addEventListener('input', lintNow);

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    input.value = EXAMPLES[chip.dataset.example];
    lintNow();
  });
}

for (const btn of document.querySelectorAll('.copy-btn')) {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = prev), 1400);
    } catch {
      /* clipboard blocked — no-op */
    }
  });
}

// Seed with the "problem" example so visitors see real output immediately.
input.value = EXAMPLES.bad;
lintNow();
