import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  SEMANTIC_SIGNATURE_VERSION,
  type Confidence,
  type JsonValue,
  type OperationKind,
  type SemanticSignature,
} from './types.js';

const READ_TOOLS = new Set([
  'read', 'read_file', 'readfile', 'read_many_files', 'glob', 'list_directory',
  'grep', 'search', 'search_files', 'web_fetch', 'web_search', 'read_mcp_resource',
]);

const MUTATION_TOOLS = new Set([
  'edit', 'write', 'write_file', 'replace', 'apply_patch', 'notebook_edit',
  'create_file', 'update_file', 'delete_file', 'move_file', 'rename_file',
]);

const SEARCH_TOOLS = new Set([
  'grep', 'glob', 'search', 'search_files', 'web_search', 'list_directory',
]);

const SHELL_TOOLS = new Set([
  'bash', 'shell', 'shell_command', 'run_shell_command', 'command_execution', 'exec_command',
]);

const MUTATION_NAME_RE = /(?:^|[_:.-])(add|append|apply|commit|create|delete|deploy|edit|insert|move|patch|publish|put|remove|rename|replace|save|send|set|update|upload|write)(?:$|[_:.-])/i;
const READ_NAME_RE = /(?:^|[_:.-])(fetch|get|glob|grep|inspect|list|query|read|search|view)(?:$|[_:.-])/i;
const VERIFY_COMMAND_RE = /(?:^|\s|\/)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|lint|build|typecheck)|(?:^|\s)(?:pytest|vitest|jest|cargo\s+test|go\s+test)(?:\s|$)/i;

export interface SignatureContext {
  cwd?: string | null;
  projectRoot?: string | null;
}

interface NormalizedOperation {
  tool: string;
  kind: OperationKind;
  args: JsonValue;
}

function normalizedToolName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function canonicalBuiltInName(base: string): string {
  if (base === 'read_file' || base === 'readfile') return 'read';
  if (base === 'write_file') return 'write';
  if (base === 'run_shell_command' || base === 'shell_command' || base === 'command_execution') return 'shell';
  return base;
}

function baseToolName(name: string): string {
  const normalized = normalizedToolName(name);
  const segments = normalized.split(/[/:.]/).filter(Boolean);
  const base = segments.at(-1) ?? normalized;
  return canonicalBuiltInName(base);
}

function canonicalToolName(name: string): string {
  const normalized = normalizedToolName(name);
  // Built-in aliases are equivalent. Namespaced/custom tools keep their full
  // identity so two MCP servers exposing `search` never co-group by accident.
  return /[/:.]/.test(normalized) ? normalized : canonicalBuiltInName(normalized);
}

function stripControls(value: string): string {
  return value
    .replace(/\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedDisplay(value: string, maxLength = 180): string {
  const safe = stripControls(value);
  return safe.length <= maxLength ? safe : `${safe.slice(0, maxLength - 1)}…`;
}

function normalizedPath(value: unknown, context: SignatureContext): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const raw = value.trim().replaceAll('\\', '/');
  const root = context.projectRoot ?? null;
  if (root && isAbsolute(raw)) {
    const absoluteRoot = resolve(root);
    const absoluteValue = resolve(raw);
    const scoped = relative(absoluteRoot, absoluteValue).replaceAll('\\', '/');
    if (scoped !== '..' && !scoped.startsWith('../')) return `./${scoped || '.'}`;
  }
  return raw.replace(/^\.\//, './');
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : Object.create(null) as Record<string, unknown>;
}

function takeFirst(input: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (Object.hasOwn(input, name)) return input[name];
  }
  return undefined;
}

function without(input: Record<string, unknown>, names: string[]): Record<string, unknown> {
  const excluded = new Set(names);
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!excluded.has(key)) output[key] = input[key];
  }
  return output;
}

function normalizeRead(input: Record<string, unknown>, context: SignatureContext): JsonValue {
  const pathKeys = ['file_path', 'path', 'filename', 'absolute_path'];
  const rangeKeys = ['offset', 'limit', 'start_line', 'end_line', 'start', 'end'];
  return toJsonValue({
    path: normalizedPath(takeFirst(input, pathKeys), context),
    offset: takeFirst(input, ['offset', 'start', 'start_line']) ?? null,
    limit: takeFirst(input, ['limit']) ?? null,
    end: takeFirst(input, ['end', 'end_line']) ?? null,
    options: without(input, [...pathKeys, ...rangeKeys]),
  });
}

function normalizeSearch(input: Record<string, unknown>, context: SignatureContext): JsonValue {
  const queryKeys = ['query', 'pattern', 'search_term'];
  const rootKeys = ['path', 'root', 'directory', 'dir_path', 'cwd'];
  const globKeys = ['glob', 'include', 'file_pattern'];
  const typeKeys = ['type', 'file_type'];
  const caseKeys = ['case_sensitive', 'caseSensitive', 'ignore_case', 'ignoreCase'];
  return toJsonValue({
    query: takeFirst(input, queryKeys) ?? null,
    root: normalizedPath(takeFirst(input, rootKeys), context),
    glob: takeFirst(input, globKeys) ?? null,
    fileType: takeFirst(input, typeKeys) ?? null,
    case: takeFirst(input, caseKeys) ?? null,
    options: without(input, [...queryKeys, ...rootKeys, ...globKeys, ...typeKeys, ...caseKeys]),
  });
}

function normalizeShell(input: Record<string, unknown>, context: SignatureContext): JsonValue {
  const command = takeFirst(input, ['command', 'cmd', 'script']);
  const cwd = takeFirst(input, ['cwd', 'workdir', 'working_directory']) ?? context.cwd;
  return toJsonValue({
    command: typeof command === 'string' ? command.replaceAll('\r\n', '\n').trim() : command ?? null,
    cwd: normalizedPath(cwd, context),
    options: without(input, ['command', 'cmd', 'script', 'cwd', 'workdir', 'working_directory']),
  });
}

function operationKind(tool: string, input: Record<string, unknown>): { kind: OperationKind; confidence: Confidence } {
  if (MUTATION_TOOLS.has(tool)) return { kind: 'mutation', confidence: 'high' };
  if (SHELL_TOOLS.has(tool)) {
    const command = takeFirst(input, ['command', 'cmd', 'script']);
    return VERIFY_COMMAND_RE.test(typeof command === 'string' ? command : '')
      ? { kind: 'verification', confidence: 'high' }
      : { kind: 'unknown', confidence: 'low' };
  }
  if (READ_TOOLS.has(tool)) return { kind: 'read', confidence: 'high' };
  if (MUTATION_NAME_RE.test(tool)) return { kind: 'mutation', confidence: 'medium' };
  if (READ_NAME_RE.test(tool)) return { kind: 'read', confidence: 'medium' };
  return { kind: 'unknown', confidence: 'low' };
}

function normalizeOperation(toolName: string, rawInput: unknown, context: SignatureContext): NormalizedOperation & { confidence: Confidence } {
  const tool = canonicalToolName(toolName);
  const base = baseToolName(toolName);
  const input = asObject(rawInput);
  const classified = operationKind(base, input);
  let args: JsonValue;
  if (SEARCH_TOOLS.has(base)) args = normalizeSearch(input, context);
  else if (SHELL_TOOLS.has(base)) args = normalizeShell(input, context);
  else if (READ_TOOLS.has(base) || MUTATION_TOOLS.has(base)) args = normalizeRead(input, context);
  else args = toJsonValue(rawInput);
  return { tool, kind: classified.kind, confidence: classified.confidence, args };
}

function tagged(key: string, value: string): JsonValue {
  return { [key]: value };
}

/** Convert arbitrary structured input to a deterministic JSON-compatible value. */
export function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : tagged('$number', String(value));
  if (typeof value === 'bigint') return tagged('$bigint', value.toString());
  if (typeof value === 'undefined') return tagged('$undefined', 'true');
  if (typeof value === 'symbol') return tagged('$symbol', value.description ?? '');
  if (typeof value === 'function') return tagged('$unsupported', 'function');
  if (typeof value !== 'object') return tagged('$unsupported', typeof value);
  if (seen.has(value)) return tagged('$circular', 'true');
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => toJsonValue(item, seen));
    if (value instanceof Date) return tagged('$date', value.toISOString());
    if (ArrayBuffer.isView(value)) {
      return tagged('$binary', Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64'));
    }
    const output = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(value).sort()) {
      let child: unknown;
      try {
        child = (value as Record<string, unknown>)[key];
      } catch {
        child = tagged('$unreadable', 'true');
      }
      output[key] = toJsonValue(child, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function stableCanonicalize(value: unknown): string {
  return JSON.stringify(toJsonValue(value));
}

function subjectOf(operation: NormalizedOperation): string | null {
  const args = operation.args;
  if (args && !Array.isArray(args) && typeof args === 'object') {
    for (const key of ['path', 'root', 'query', 'command']) {
      const value = args[key];
      if (typeof value === 'string' && value !== '') return boundedDisplay(value, 120);
    }
  }
  return operation.tool || null;
}

export function buildSemanticSignature(
  toolName: string,
  input: unknown,
  context: SignatureContext = {},
): SemanticSignature {
  const operation = normalizeOperation(toolName, input, context);
  const canonical = stableCanonicalize({
    version: SEMANTIC_SIGNATURE_VERSION,
    tool: operation.tool,
    kind: operation.kind,
    args: operation.args,
  });
  const digest = createHash('sha256')
    .update(`tripwire-review-signature:v${SEMANTIC_SIGNATURE_VERSION}\0`)
    .update(canonical)
    .digest('hex');
  const subject = subjectOf(operation);
  return {
    version: SEMANTIC_SIGNATURE_VERSION,
    digest,
    canonical,
    display: boundedDisplay(`${operation.tool}${subject ? `: ${subject}` : ''}`),
    subject,
    operationKind: operation.kind,
    confidence: operation.confidence,
  };
}

export function classifyOperation(toolName: string, input: unknown): { kind: OperationKind; confidence: Confidence } {
  return operationKind(baseToolName(toolName), asObject(input));
}

export function fingerprintResult(value: string | Uint8Array): string {
  return createHash('sha256')
    .update('tripwire-review-result:v1\0')
    .update(value)
    .digest('hex');
}
