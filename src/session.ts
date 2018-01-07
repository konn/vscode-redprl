import * as childProcess from "child_process";
import * as lodash from "lodash";
import * as vs from "vscode";
import { parseDiagnostics } from "./parser";
import Pattern from "./pattern";

export default class Session {
  public readonly config: {
    enableDiagnosticsOnSave: boolean;
    path: null | string;
  };
  public readonly diagnostics: vs.DiagnosticCollection;
  public readonly lenses: Map<string, vs.CodeLens[]> = new Map();
  public readonly output: vs.OutputChannel;
  public readonly refreshDebounced: ((document: vs.TextDocument) => Promise<void>) & lodash.Cancelable;

  constructor() {
    this.config = vs.workspace.getConfiguration("redprl") as any;
    this.diagnostics = vs.languages.createDiagnosticCollection("redprl");
    this.output = vs.window.createOutputChannel("RedPRL");
    this.refreshDebounced = lodash.debounce(this.refreshImmediate, 500, { trailing: true });
    if (null == this.config.path)
      vs.window.showWarningMessage(`The RedPRL binary path needs to be configured. See the "redprl.path" setting.`);
    return this;
  }

  public dispose(): void {
    return;
  }

  public execute(document: vs.TextDocument): Promise<null | string> {
    if (null == this.config.path) {
      vs.window.showWarningMessage(`The RedPRL binary path needs to be configured. See the "redprl.path" setting.`);
      return Promise.resolve(null);
    }
    const child = childProcess.spawn(this.config.path, [`--from-stdin=${document.fileName}`]);
    return new Promise<null | string>(resolve => {
      let buffer = "";
      child.on("close", (code: number) => (code === 0 || code === 1 ? resolve(buffer) : resolve(null)));
      child.on("error", (error: Error & { code: string }) => {
        if (error.code === "ENOENT") {
          vs.window.showWarningMessage(`Cannot find redprl binary at "${this.config.path}".`);
          vs.window.showWarningMessage(
            `Double check your path or try configuring "redprl.path" under "User Settings".`,
          );
        }
      });
      child.stdin.write(document.getText(), "utf-8", () => child.stdin.end());
      child.stderr.on("data", (data: Buffer | string) => (buffer += data));
      child.stdout.on("data", (data: Buffer | string) => (buffer += data));
    });
  }

  public async refreshImmediate(document: vs.TextDocument): Promise<void> {
    const response = await this.execute(document);
    if (null == response) {
      vs.window.showErrorMessage("running 'redprl' failed");
      return;
    }
    const diagnostics = parseDiagnostics(response);
    this.diagnostics.clear();
    const collatedDiagnostics: Map<vs.Uri, vs.Diagnostic[]> = new Map();
    const lenses: vs.CodeLens[] = [];
    for (const diagnostic of diagnostics) {
      let uri: vs.Uri;
      try {
        uri = vs.Uri.file(diagnostic.path);
      } catch (err) {
        continue;
      } // uri parsing failed
      let severity: null | vs.DiagnosticSeverity = null;
      switch (diagnostic.kind) {
        case "Error":
          severity = vs.DiagnosticSeverity.Error;
          break;
        case "Info":
          severity = vs.DiagnosticSeverity.Information;
          break;
        case "Warning":
          severity = vs.DiagnosticSeverity.Warning;
          break;
        default:
          break;
      }
      if (null == severity) continue;
      if (!collatedDiagnostics.has(uri)) collatedDiagnostics.set(uri, []);
      const diagnostics = collatedDiagnostics.get(uri) as vs.Diagnostic[];
      if (Pattern.remainingObligations.test(diagnostic.content[0])) {
        const command = { command: "", title: `★ ${diagnostic.content.join("\n")}` };
        lenses.push(new vs.CodeLens(diagnostic.range, command));
      } else {
        diagnostics.push(new vs.Diagnostic(diagnostic.range, diagnostic.content.join("\n"), severity));
      }
    }
    this.diagnostics.set(Array.from(collatedDiagnostics.entries()));
    this.lenses.set(document.uri.toString(), lenses);
  }
}
