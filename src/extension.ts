// tslint:disable object-literal-sort-keys

import * as childProcess from "child_process";
import * as vscode from "vscode";

const configuration = {
  wordPattern: /(-?\d*\.\d\w*)|[\w][\w\d]*([.][\w][\w\d]*)*|((?!\|[^\|])[\-;:!?.@*/\\&#%^+<=>|~$]+)/,
};

class Pattern {
  static diagnostic = /^(.*?):(\d+)[.](\d+)-(\d+)[.](\d+)\s*\[\b(Error|Info|Warning)\b\]:\n\s*([\s\S]*?)\s*^\s*(?=-)([\s\S]*?)(?=\s*\n\n)/gmu;
}

class Session {
  public readonly config: {
    enableDiagnosticsOnSave: boolean;
    path: null | string;
  };
  public readonly diagnostics: vscode.DiagnosticCollection;
  public readonly output: vscode.OutputChannel;

  constructor()
  {
    this.config = vscode.workspace.getConfiguration("redprl") as any;
    this.diagnostics = vscode.languages.createDiagnosticCollection("RedPRL");
    this.output = vscode.window.createOutputChannel("RedPRL");
    if (this.config.path == null) {
      vscode.window.showWarningMessage(`The RedPRL binary path needs to be configured. See the "redprl.path" setting.`);
    }
    return this;
  }

  execute(fileName: string): Promise<null | string> {
    if (this.config.path == null) {
      vscode.window.showWarningMessage(`The RedPRL binary path needs to be configured. See the "redprl.path" setting.`);
      return Promise.resolve(null);
    };
    const child = childProcess.spawn(this.config.path, [fileName]);
    return new Promise<null | string>((resolve) => {
      let buffer = "";
      child.stdout.on("data", (data: Buffer | string) => buffer += data);
      child.on("close", (code: number) => code === 0 || code === 1 ? resolve(buffer) : resolve(null));
      child.on("error", (error: Error & { code: string }) => {
        if (error.code === "ENOENT") {
          vscode.window.showWarningMessage(`Cannot find redprl binary at "${this.config.path}".`);
          vscode.window.showWarningMessage(`Double check your path or try configuring "redprl.path" under "User Settings".`);
        }
      });
    });
  }

  async refresh(textDocument: vscode.TextDocument): Promise<void> {
    const response = await this.execute(textDocument.fileName);
    if (response != null) await this.refreshDiagnostics(response);
  }

  // NOTE: some of this data should probably be displayed in a virtual document in a separate panel
  async refreshDiagnostics(response: string): Promise<void> {
    this.diagnostics.clear();
    let collated: Map<vscode.Uri, vscode.Diagnostic[]> = new Map();
    let matchDiagnostic: null | RegExpExecArray = null;
    while ((matchDiagnostic = Pattern.diagnostic.exec(response)) != null) {
      matchDiagnostic.shift();
      const [path, startLineRaw, startCharRaw, endLineRaw, endCharRaw, kind, message] = matchDiagnostic;
      let severity: null | vscode.DiagnosticSeverity = null;
      switch (kind) {
        case "Error":
          severity = vscode.DiagnosticSeverity.Information;
          break;
        case "Info":
          severity = vscode.DiagnosticSeverity.Information;
          break;
        case "Warning":
          severity = vscode.DiagnosticSeverity.Warning;
          break;
      }
      if (severity != null) {
        let uri: vscode.Uri;
        try { uri = vscode.Uri.parse(`file://${path}`) } catch (err) { continue }
        const startLine = parseInt(startLineRaw);
        const startChar = parseInt(startCharRaw);
        const   endLine = parseInt(  endLineRaw);
        const   endChar = parseInt(  endCharRaw);
        if (!collated.has(uri)) collated.set(uri, []);
        const diagnostics = collated.get(uri) as vscode.Diagnostic[];
        const range = new vscode.Range(startLine, startChar, endLine, endChar);
        const entry = new vscode.Diagnostic(range, message, severity);
        diagnostics.push(entry);
      }
    }
    const entries = Array.from(collated.entries());
    this.diagnostics.set(entries);
  }
}

function onDidChangeConfiguration(session: Session): () => void {
  return () => (session as any).config = vscode.workspace.getConfiguration("redprl");
}

function onDidSaveTextDocument(session: Session): (textDocument: vscode.TextDocument) => void {
  return (textDocument) => {
    if (textDocument.languageId !== "redprl") return;
    if (session.config.enableDiagnosticsOnSave) session.refresh(textDocument);
  };
}

export function activate(context: vscode.ExtensionContext) {
  const session = new Session();
  context.subscriptions.push(vscode.languages.setLanguageConfiguration("redprl", configuration));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand("redprl.refreshDiagnostics", (editor) => session.refresh(editor.document)));
  vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration(session));
  vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument(session));
}

export function deactivate() {
  return;
}
