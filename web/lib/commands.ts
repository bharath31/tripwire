export type Agent = 'claude' | 'codex' | 'gemini';
export type Expectation = 'activate' | 'quiet';
export type Shell = 'posix' | 'powershell';

export interface SetupInput {
  agent: Agent;
  path: string;
  prompt: string;
  expectation: Expectation;
  shell: Shell;
}

export interface GitHubRepository {
  owner: string;
  name: string;
}

export const LINT_WORKFLOW = `name: Tripwire
on: pull_request
jobs:
  skills:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: bharath31/tripwire@v1
`;

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function shellQuote(value: string, shell: Shell): string {
  return shell === 'powershell' ? quotePowerShell(value) : quotePosix(value);
}

export function buildTestCommand(input: SetupInput): string {
  const quote = (value: string) => shellQuote(value, input.shell);
  return [
    'npx tripwire-skills@latest test',
    quote(input.path.trim()),
    '--prompt',
    quote(input.prompt.trim()),
    '--expect',
    input.expectation,
    '--agent',
    input.agent,
  ].join(' ');
}

export function buildAnalyzeCommand(path: string, agent: Agent, shell: Shell): string {
  return `npx tripwire-skills@latest analyze ${shellQuote(path.trim(), shell)} --agent ${agent}`;
}

export function buildInitCommand(path: string, shell: Shell): string {
  return `npx tripwire-skills@latest init ${shellQuote(path.trim(), shell)}`;
}

export function parseGitHubRepository(input: string): GitHubRepository | null {
  const trimmed = input.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const match = trimmed.match(/^(?:https?:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  return match ? { owner: match[1], name: match[2] } : null;
}

export function buildGitHubWorkflowUrl(
  repository: GitHubRepository,
  branch: string,
  workflow = LINT_WORKFLOW,
): string {
  const safeBranch = branch.trim() || 'main';
  const params = new URLSearchParams({
    filename: '.github/workflows/tripwire.yml',
    value: workflow,
    message: 'Add Tripwire skill checks',
  });
  return `https://github.com/${repository.owner}/${repository.name}/new/${encodeURIComponent(safeBranch)}?${params}`;
}
