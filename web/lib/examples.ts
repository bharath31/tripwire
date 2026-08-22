export const GOOD_SKILL = `---
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
codebase stays consistent and responses stay predictable for callers.`;

export const BAD_SKILL = `---
name: MyHelper
description: This helper does stuff. Step 1 is to set things up.
---

## Notes

TODO: write this properly.

Run the thing and it works.`;
