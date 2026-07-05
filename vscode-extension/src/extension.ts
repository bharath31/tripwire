import * as vscode from 'vscode';
import matter from 'gray-matter';
import { lint } from '../../src/lint/rules.js';
import { lintResultToDiagnostics } from './diagnostics.js';

function isSkillFile(document: vscode.TextDocument): boolean {
  return document.fileName.toLowerCase().endsWith('skill.md');
}

function lintDocument(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
  if (!isSkillFile(document)) return;

  const text = document.getText();
  const parsed = matter(text);
  const result = lint({
    frontmatter: parsed.data as Partial<{ name: string; description: string }>,
    body: parsed.content.trim(),
    filePath: document.fileName,
  });

  const diagnostics = lintResultToDiagnostics(text, result).map((d) => {
    const range = new vscode.Range(d.line, d.startCol, d.line, d.endCol);
    const severity = d.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
    const diagnostic = new vscode.Diagnostic(range, `[${d.rule}] ${d.message}`, severity);
    diagnostic.source = 'tripwire';
    diagnostic.code = d.rule;
    return diagnostic;
  });

  collection.set(document.uri, diagnostics);
}

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('tripwire');
  context.subscriptions.push(collection);

  for (const doc of vscode.workspace.textDocuments) lintDocument(doc, collection);

  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => lintDocument(doc, collection)));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => lintDocument(doc, collection)));
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => lintDocument(e.document, collection)),
  );
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
  );
}

export function deactivate(): void {}
