import * as childProcess from "child_process";
import * as lodash from "lodash";
import * as vs from "vscode";
import Pattern from "./pattern";

export default class Session {
  public readonly config: {
    enableDiagnosticsOnSave: boolean;
    path: null | string;
  };
  public readonly diagnostics: vs.DiagnosticCollection;
  public readonly output: vs.OutputChannel;
  public readonly refreshDebounced: ((document: vs.TextDocument) => Promise<void>) & lodash.Cancelable;
  public readonly symbols: Map<string, vs.SymbolInformation[]> = new Map();

  constructor() {
    this.config = vs.workspace.getConfiguration("redprl") as any;
    this.diagnostics = vs.languages.createDiagnosticCollection("redprl");
    this.output = vs.window.createOutputChannel("RedPRL");
    this.refreshDebounced = lodash.debounce(this.refreshImmediate, 500, { trailing: true });
    if (this.config.path == null) vs.window.showWarningMessage(`The RedPRL binary path needs to be configured. See the "redprl.path" setting.`);
    return this;
  }

  public dispose(): void {
    return;
  }

  public execute(document: vs.TextDocument): Promise<null | string> {
    if (this.config.path == null) {
      vs.window.showWarningMessage(`The RedPRL binary path needs to be configured. See the "redprl.path" setting.`);
      return Promise.resolve(null);
    }
    const child = childProcess.spawn(this.config.path, [`--from-stdin=${document.fileName}`]);
    return new Promise<null | string>((resolve) => {
      let buffer = "";
      child.on("close", (code: number) => code === 0 || code === 1 ? resolve(buffer) : resolve(null));
      child.on("error", (error: Error & { code: string }) => {
        if (error.code === "ENOENT") {
          vs.window.showWarningMessage(`Cannot find redprl binary at "${this.config.path}".`);
          vs.window.showWarningMessage(`Double check your path or try configuring "redprl.path" under "User Settings".`);
        }
      });
      child.stdin.write(document.getText(), "utf-8", () => child.stdin.end());
      child.stderr.on("data", (data: Buffer | string) => buffer += data);
      child.stdout.on("data", (data: Buffer | string) => buffer += data);
    });
  }

  // FIXME: time to split this up…
  public async refreshImmediate(document: vs.TextDocument): Promise<void> {
    const response = await this.execute(document);
    if (response == null) return; // redprl failed
    this.diagnostics.clear();
    let collatedDiagnostics: Map<vs.Uri, vs.Diagnostic[]> = new Map();
    let symbols: vs.SymbolInformation[] = [];
    let diagnosticMatch: null | RegExpExecArray = null;
    while ((diagnosticMatch = Pattern.diagnostic.exec(response)) != null) { // tslint:disable-line no-conditional-assignment
      const goalStack: vs.Diagnostic[] = [];
      diagnosticMatch.shift(); // throw away entire match since we only want the captures
      const path = diagnosticMatch.shift() as string;
      let uri: vs.Uri;
      try { uri = vs.Uri.parse(`file://${path}`); } catch (err) { continue; } // uri parsing failed
      const startLine = parseInt(diagnosticMatch.shift() as string, 10) - 1;
      const startChar = parseInt(diagnosticMatch.shift() as string, 10) - 1;
      const   endLine = parseInt(diagnosticMatch.shift() as string, 10) - 1;
      const   endChar = parseInt(diagnosticMatch.shift() as string, 10) - 1;
      const range = new vs.Range(startLine, startChar, endLine, endChar);
      const messageKind = diagnosticMatch.shift() as string;
      // parse symbols
      if (messageKind === "Output") {
        const output = diagnosticMatch.shift() as string;
        const result = output.match(Pattern.symbol);
        if (result == null) continue; // symbol parsing failed
        result.shift();
        const [symbolWire, name] = result;
        let symbolCode = vs.SymbolKind.Null;
        switch (symbolWire) {
          case "Def": symbolCode = vs.SymbolKind.Function; break;
          case "Tac": symbolCode = vs.SymbolKind.Interface; break;
          case "Thm": symbolCode = vs.SymbolKind.Null; break;
          default: break;
        }
        const location = new vs.Location(uri, range);
        symbols.push(new vs.SymbolInformation(name, symbolCode, "", location));
      } else { // parse diagnostics
        let severity: null | vs.DiagnosticSeverity = null;
        switch (messageKind) {
          case   "Error": severity = vs.DiagnosticSeverity.Error; break;
          case    "Info": severity = vs.DiagnosticSeverity.Information; break;
          case "Warning": severity = vs.DiagnosticSeverity.Warning; break;
          default: break;
        }
        if (severity == null) continue; // diagnostic parsing failed
        if (!collatedDiagnostics.has(uri)) collatedDiagnostics.set(uri, []);
        const diagnostics = collatedDiagnostics.get(uri) as vs.Diagnostic[];
        let message = diagnosticMatch.shift() as string;
        // here we split up the goals into individual diagnostics since it looks better in vscode
        if (messageKind === "Warning") {
          const remainingGoalsMessage = message;
          let goalMatch: null | RegExpExecArray = null;
          let goalsFound = 0;
          while ((goalMatch = Pattern.goal.exec(remainingGoalsMessage)) != null) { // tslint:disable-line no-conditional-assignment
            goalsFound++;
            goalMatch.shift();
            const [goalNumber, goalItems] = goalMatch;
            let goalMessage = `[#${goalNumber}]${"\n"}`;
            let itemMatch: null | RegExpExecArray = null;
            while ((itemMatch = Pattern.goalItem.exec(goalItems)) != null) { // tslint:disable-line no-conditional-assignment
              goalMessage += itemMatch[1].trim();
              goalMessage += ";\n";
            }
            const entry = new vs.Diagnostic(range, goalMessage, vs.DiagnosticSeverity.Information);
            // entry.source = `${goalNumber}`; // FIXME: using the source field messes with indentation
            goalStack.push(entry);
          }
          if (goalsFound > 0) message = "Remaining Obligations";
        }
        const entry = new vs.Diagnostic(range, message, severity);
        diagnostics.push(entry);
        while (goalStack.length > 0) diagnostics.push(goalStack.shift() as any);
      }
    }
    this.diagnostics.set(Array.from(collatedDiagnostics.entries()));
    this.symbols.set(document.uri.toString(), symbols);
  }
}
