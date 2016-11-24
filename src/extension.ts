import * as vs from "vscode";
import configuration from "./configuration";
import * as event from "./event";
import * as feature from "./feature";
import Session from "./session";

export function activate(context: vs.ExtensionContext): void {
  const session = new Session();
  context.subscriptions.push(vs.commands.registerTextEditorCommand("redprl.refreshDiagnostics", (editor) => session.refreshImmediate(editor.document)));
  context.subscriptions.push(vs.languages.setLanguageConfiguration("redprl", configuration));
  context.subscriptions.push(vs.languages.registerDocumentSymbolProvider({ language: "redprl" }, feature.documentSymbolProvider(session)));
  context.subscriptions.push(vs.workspace.onDidChangeConfiguration(event.onDidChangeConfiguration(session)));
  context.subscriptions.push(vs.workspace.onDidSaveTextDocument(event.onDidSaveTextDocument(session)));
  context.subscriptions.push(vs.workspace.onDidChangeTextDocument(event.onDidChangeTextDocument(session)));
  context.subscriptions.push(session);
}

export function deactivate(): void {
  return;
}
