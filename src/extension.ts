import * as vs from "vscode";
import configuration from "./configuration";
import * as event from "./event";
import * as feature from "./feature";
import Session from "./session";

export function activate(context: vs.ExtensionContext): void {
  const session = new Session();
  const language = "redprl";
  context.subscriptions.push(
    vs.languages.setLanguageConfiguration("redprl", configuration),
    vs.languages.registerCodeLensProvider({ language }, feature.codeLensProvider(session)),
    vs.languages.registerDocumentSymbolProvider({ language }, feature.documentSymbolProvider(session)),
    vs.commands.registerTextEditorCommand("redprl.insertProbe", (editor) => {
      editor.edit((editBuilder) => {
        editBuilder.insert(editor.selection.start, "?hole");
      });
    }),

    vs.workspace.onDidChangeConfiguration(event.onDidChangeConfiguration(session)),
    vs.workspace.onDidSaveTextDocument(event.onDidSaveTextDocument(session)),
    vs.workspace.onDidChangeTextDocument(event.onDidChangeTextDocument(session)),
    session,
  );
}

export function deactivate(): void {
  return;
}
