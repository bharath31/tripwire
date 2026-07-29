import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const WORKFLOW_TEMPLATE = `name: Tripwire
on: pull_request
jobs:
  skills:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write   # for the summary comment
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0       # needed to diff the PR
      - uses: bharath31/tripwire@v1
        with:
          probe: true                                       # also run coverage checks
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}  # your key, your runner
`;

const DRIFT_WORKFLOW_TEMPLATE = `name: Tripwire Drift Check
on:
  schedule:
    - cron: '0 9 * * 1'   # every Monday at 09:00 UTC — model behavior can shift between PRs
  workflow_dispatch: {}    # allow a manual run too
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 20
      - name: Rerun committed scenarios against the live model
        run: npx tripwire-skills test-all .
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findRepoRoot(startDir: string): Promise<string> {
  let dir = resolve(startDir);
  while (true) {
    if (await exists(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir); // no .git found — fall back to start dir
    dir = parent;
  }
}

export interface ScaffoldResult {
  path: string;
  created: boolean;
}

async function scaffoldWorkflowFile(repoRoot: string, fileName: string, template: string): Promise<ScaffoldResult> {
  const workflowDir = join(repoRoot, '.github', 'workflows');
  const workflowPath = join(workflowDir, fileName);

  if (await exists(workflowPath)) {
    return { path: workflowPath, created: false };
  }

  await mkdir(workflowDir, { recursive: true });
  await writeFile(workflowPath, template, 'utf-8');
  return { path: workflowPath, created: true };
}

export async function scaffoldWorkflow(repoRoot: string): Promise<ScaffoldResult> {
  return scaffoldWorkflowFile(repoRoot, 'tripwire.yml', WORKFLOW_TEMPLATE);
}

export async function scaffoldDriftWorkflow(repoRoot: string): Promise<ScaffoldResult> {
  return scaffoldWorkflowFile(repoRoot, 'tripwire-drift.yml', DRIFT_WORKFLOW_TEMPLATE);
}
