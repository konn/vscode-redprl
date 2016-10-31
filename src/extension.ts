// tslint:disable object-literal-sort-keys

import * as childProcess from "child_process";
import * as vscode from "vscode";

const configuration = {
  wordPattern: /(-?\d*\.\d\w*)|[\w][\w\d]*([.][\w][\w\d]*)*|((?!\|[^\|])[\-;:!?.@*/\\&#%^+<=>|~$]+)/,
};

class Pattern {
  static diagnostic = /^(.*?):(\d+)[.](\d+)-(\d+)[.](\d+)\s*\[(Error|Info|Output|Warning)\]:\n\s\s([\s\S]*?)\s*^\s*(?:(?=-)(?:.*\n){6}\s*([\s\S]*?))?(?=\s*\n\n)/gmu;
  static symbol = /^\b(Def|Tac|Thm)\b\s*\b(\w+)\b/u
}

class Session {
  public readonly config: {
    enableDiagnosticsOnSave: boolean;
    path: null | string;
  };
  public readonly diagnostics: vscode.DiagnosticCollection;
  public readonly output: vscode.OutputChannel;
  public readonly symbols: Map<string, vscode.SymbolInformation[]> = new Map();

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
      child.stderr.on("data", (data: Buffer | string) => buffer += data);
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

  async refresh(document: vscode.TextDocument): Promise<void> {
    const response = await this.execute(document.fileName);
    if (response == null) return;
    this.diagnostics.clear();
    let collatedDiagnostics: Map<vscode.Uri, vscode.Diagnostic[]> = new Map();
    let symbols: vscode.SymbolInformation[] = [];
    let match: null | RegExpExecArray = null;
    while ((match = Pattern.diagnostic.exec(response)) != null) {
      match.shift(); // throw away entire match since we only want the captures
      const path = match.shift() as string;
      let uri: vscode.Uri;
      try { uri = vscode.Uri.parse(`file://${path}`) } catch (err) { continue }
      const startLine = parseInt(match.shift() as string) - 1;
      const startChar = parseInt(match.shift() as string) - 1;
      const   endLine = parseInt(match.shift() as string) - 1;
      const   endChar = parseInt(match.shift() as string) - 1;
      const range = new vscode.Range(startLine, startChar, endLine, endChar);
      const messageKind = match.shift() as string;
      if (messageKind === "Output") {
        const output = match.shift() as string;
        const result = output.match(Pattern.symbol);
        if (result == null) continue;
        result.shift();
        const [symbolWire, name] = result;
        let symbolCode = vscode.SymbolKind.Null;
        switch (symbolWire) {
          case "Def": symbolCode = vscode.SymbolKind.Function; break;
          case "Tac": symbolCode = vscode.SymbolKind.Interface; break;
          case "Thm": symbolCode = vscode.SymbolKind.Null; break;
        }
        const location = new vscode.Location(uri, range);
        symbols.push(new vscode.SymbolInformation(name, symbolCode, "", location));
      } else {
        let severity: null | vscode.DiagnosticSeverity = null;
        switch (messageKind) {
          case   "Error": severity = vscode.DiagnosticSeverity.Error; break;
          case    "Info": severity = vscode.DiagnosticSeverity.Information; break;
          case "Warning": severity = vscode.DiagnosticSeverity.Warning; break;
        }
        if (severity == null) continue;
        if (!collatedDiagnostics.has(uri)) collatedDiagnostics.set(uri, []);
        const diagnostics = collatedDiagnostics.get(uri) as vscode.Diagnostic[];
        const message = match.shift() as string;
        const entry = new vscode.Diagnostic(range, message, severity);
        diagnostics.push(entry);
      }
    }
    this.diagnostics.set(Array.from(collatedDiagnostics.entries()));
    this.symbols.set(document.uri.toString(), symbols);
  }
}

function documentSymbolProvider(session: Session): vscode.DocumentSymbolProvider {
  return {
    provideDocumentSymbols: async (document) => {
      if (document.languageId !== "redprl") return;
      if (!session.symbols.has(document.uri.toString())) await session.refresh(document);
      return session.symbols.get(document.uri.toString());
    },
  };
}

function onDidChangeConfiguration(session: Session): () => void {
  return () => (session as any).config = vscode.workspace.getConfiguration("redprl");
}

function onDidSaveTextDocument(session: Session): (document: vscode.TextDocument) => void {
  return (document) => {
    if (document.languageId !== "redprl") return;
    if (session.config.enableDiagnosticsOnSave) session.refresh(document);
  };
}

export function activate(context: vscode.ExtensionContext) {
  const session = new Session();
  context.subscriptions.push(vscode.commands.registerTextEditorCommand("redprl.refreshDiagnostics", (editor) => session.refresh(editor.document)));
  context.subscriptions.push(vscode.languages.setLanguageConfiguration("redprl", configuration));
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: 'redprl' }, documentSymbolProvider(session)));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration(session)));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument(session)));
}

export function deactivate() {
  return;
}
