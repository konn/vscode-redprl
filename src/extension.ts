// tslint:disable object-literal-sort-keys

import * as childProcess from "child_process";
import * as vscode from "vscode";

const configuration = {
  wordPattern: /(-?\d*\.\d\w*)|[\w][\w\d]*([.][\w][\w\d]*)*|((?!\|[^\|])[\-;:!?.@*/\\&#%^+<=>|~$]+)/,
};

class Pattern {
  static diagnostic = /^(.*?):(\d+)[.](\d+)-(\d+)[.](\d+)\s*\[(Error|Info|Output|Warning)\]:\n[ ]{2}([\s\S]*?\n)\s*^\s*(?:(?=-)(?:.*\n){6}\s*([\s\S]*?))?(?=\s*\n{2})/gmu;
  static goal = /[ ]{2}Goal\s*(\d+)[.]\n([\s\S]*?)(?=\s*Goal|$)/gu;
  static goalItem = /^[ ]{4}(.*)$/gmu;
  static symbol = /^\b(Def|Tac|Thm)\b\s*\b([\w\-\/]+)\b/u
}

class Session {
  public readonly config: {
    enableDiagnosticsOnSave: boolean;
    path: null | string;
  };
  public readonly diagnostics: vscode.DiagnosticCollection;
  public readonly lenses: Map<string, vscode.CodeLens[]> = new Map();
  public readonly output: vscode.OutputChannel;
  public readonly symbols: Map<string, vscode.SymbolInformation[]> = new Map();

  constructor()
  {
    this.config = vscode.workspace.getConfiguration("redprl") as any;
    this.diagnostics = vscode.languages.createDiagnosticCollection("redprl");
    this.output = vscode.window.createOutputChannel("RedPRL");
    if (this.config.path == null) vscode.window.showWarningMessage(`The RedPRL binary path needs to be configured. See the "redprl.path" setting.`);
    return this;
  }

  public dispose(): void {
  }

  public execute(fileName: string): Promise<null | string> {
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

  // FIXME: time to split this up…
  public async refresh(document: vscode.TextDocument): Promise<void> {
    const response = await this.execute(document.fileName);
    if (response == null) return; // redprl failed
    this.diagnostics.clear();
    let collatedDiagnostics: Map<vscode.Uri, vscode.Diagnostic[]> = new Map();
    let lenses: vscode.CodeLens[] = [];
    let symbols: vscode.SymbolInformation[] = [];
    let diagnosticMatch: null | RegExpExecArray = null;
    while ((diagnosticMatch = Pattern.diagnostic.exec(response)) != null) {
      const goalStack: vscode.Diagnostic[] = [];
      diagnosticMatch.shift(); // throw away entire match since we only want the captures
      const path = diagnosticMatch.shift() as string;
      let uri: vscode.Uri;
      try { uri = vscode.Uri.parse(`file://${path}`) } catch (err) { continue } // uri parsing failed
      const startLine = parseInt(diagnosticMatch.shift() as string) - 1;
      const startChar = parseInt(diagnosticMatch.shift() as string) - 1;
      const   endLine = parseInt(diagnosticMatch.shift() as string) - 1;
      const   endChar = parseInt(diagnosticMatch.shift() as string) - 1;
      const range = new vscode.Range(startLine, startChar, endLine, endChar);
      const messageKind = diagnosticMatch.shift() as string;
      // parse symbols
      if (messageKind === "Output") {
        const output = diagnosticMatch.shift() as string;
        const result = output.match(Pattern.symbol);
        if (result == null) continue; // symbol parsing failed
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
      }
      // parse diagnostics
      else {
        let severity: null | vscode.DiagnosticSeverity = null;
        switch (messageKind) {
          case   "Error": severity = vscode.DiagnosticSeverity.Error; break;
          case    "Info": severity = vscode.DiagnosticSeverity.Information; break;
          case "Warning": severity = vscode.DiagnosticSeverity.Warning; break;
        }
        if (severity == null) continue; // diagnostic parsing failed
        if (!collatedDiagnostics.has(uri)) collatedDiagnostics.set(uri, []);
        const diagnostics = collatedDiagnostics.get(uri) as vscode.Diagnostic[];
        let message = diagnosticMatch.shift() as string;
        // here we split up the goals into individual diagnostics since it looks better in vscode
        if (messageKind === "Warning") {
          const remainingGoalsMessage = message;
          let goalMatch: null | RegExpExecArray = null;
          let goalsFound = 0;
          while ((goalMatch = Pattern.goal.exec(remainingGoalsMessage)) != null) {
            goalsFound++;
            goalMatch.shift();
            const [goalNumber, goalItems] = goalMatch;
            let goalMessage = `[#${goalNumber}]${"\n"}`;
            let itemMatch: null | RegExpExecArray = null;
            while ((itemMatch = Pattern.goalItem.exec(goalItems)) != null) {
              goalMessage += itemMatch[1].trim();
              goalMessage += ";\n";
            }
            const entry = new vscode.Diagnostic(range, goalMessage, vscode.DiagnosticSeverity.Information);
            // entry.source = `${goalNumber}`; // FIXME: using the source field messes with indentation
            goalStack.push(entry);
          }
          if (goalsFound > 0) {
            message = "Remaining Obligations";
            let enclosing = symbols.find((symbol) => symbol.location.range.contains(range));
            if (enclosing) {
              const command = { command: "", title: `${goalsFound} goals` };
              lenses.push(new vscode.CodeLens(enclosing.location.range, command));
            }
          }
        }
        const entry = new vscode.Diagnostic(range, message, severity);
        diagnostics.push(entry);
        for (const goal of goalStack) diagnostics.push(goal);
      }
    }
    this.diagnostics.set(Array.from(collatedDiagnostics.entries()));
    this.lenses.set(document.uri.toString(), lenses);
    this.symbols.set(document.uri.toString(), symbols);
  }
}

function codeLensProvider(session: Session): vscode.CodeLensProvider {
  return {
    provideCodeLenses: async (document) => {
      if (document.languageId !== "redprl") return [];
      if (!session.lenses.has(document.uri.toString())) await session.refresh(document);
      const lenses = session.lenses.get(document.uri.toString());
      return lenses || [];
    },
  };
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

export function activate(context: vscode.ExtensionContext): void {
  const session = new Session();
  context.subscriptions.push(vscode.commands.registerTextEditorCommand("redprl.refreshDiagnostics", (editor) => session.refresh(editor.document)));
  context.subscriptions.push(vscode.languages.setLanguageConfiguration("redprl", configuration));
  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: "redprl" }, codeLensProvider(session)));
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: "redprl" }, documentSymbolProvider(session)));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration(session)));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument(session)));
  context.subscriptions.push(session);
}

export function deactivate(): void {
  return;
}
