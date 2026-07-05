# Tripwire for Agent Skills (VS Code)

Lints `SKILL.md` files as you write them — the same checks `tripwire lint` runs in CI, surfaced
as inline squiggles instead of a terminal report.

**Status:** build-only scaffold. This has been built, type-checked, and packaged into a real
`.vsix` locally, but has **not been published to the VS Code Marketplace** and has not yet been
run inside a live VS Code window — see the parent repo's `ROADMAP.md` for context.

## What it does

On open, edit, and save of any file ending in `SKILL.md`, it runs tripwire's lint engine
(`src/lint/rules.ts`, the exact same code the CLI and Action use — bundled in, not reimplemented)
and reports errors and warnings as VS Code diagnostics:

- Frontmatter rules (`name-*`, `description-*`) are positioned on their respective `name:` /
  `description:` line.
- Body rules (`no-placeholders`, `body-too-short`, `no-code-example`, `no-comment-blocks`) are
  positioned at the first line of the body, right after the closing `---`. This is intentionally
  a best-effort position, not a precise character range — `LintError` doesn't carry offsets today.

## Building locally

```bash
npm install
npm run build      # bundles src/extension.ts -> dist/extension.js (esbuild, vscode external)
npm run package     # produces a local .vsix via @vscode/vsce — does not publish anywhere
```

To try it in a real VS Code window: run `code --install-extension tripwire-skills-vscode-0.1.0.vsix`
after packaging, or use VS Code's "Install from VSIX" command.

## Known gaps (honest, not hidden)

- Diagnostic positions are line-level, not character-precise.
- Not yet verified inside a real running VS Code instance — only type-checked, bundled, and
  packaged. The core lint logic itself is unit-tested (`tests/vscode-extension/diagnostics.test.ts`)
  against the real engine; the `vscode`-API glue in `extension.ts` is not, since `vscode` only
  exists inside the extension host.
- No auto-fix action wired to `tripwire lint --fix` yet — diagnostics are read-only today.
