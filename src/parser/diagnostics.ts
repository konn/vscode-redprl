import * as vs from "vscode";
import Pattern from "../pattern";

type DiagnosticKind = "Info" | "Output" | "Warning" | "Error";

export interface IDiagnostic {
  kind: DiagnosticKind;
  path: string;
  range: vs.Range;
  content: string[];
}

export function parseDiagnostics(response: string): IDiagnostic[] {
  const lines = response.split("\n");
  const diagnostics: IDiagnostic[] = [];
  while (lines.length > 0) {
    const headerLine = lines.shift() as string;
    const match = headerLine.match(Pattern.headerLine);
    if (null == match) continue;
    const path = match[1];
    const startLine = parseInt(match[2] as string, 10) - 1;
    const startChar = parseInt(match[3] as string, 10) - 1;
    const endLine = parseInt(match[4] as string, 10) - 1;
    const endChar = parseInt(match[5] as string, 10) - 1;
    const range = new vs.Range(startLine, startChar, endLine, endChar);
    const kind = match[6] as DiagnosticKind;
    const content = [];
    while (lines.length > 0) {
      const contentLine = lines.shift() as string;
      if (!/^\s\s/.test(contentLine)) break;
      content.push(contentLine.slice(2));
    }
    diagnostics.push({ kind, path, range, content });
  }
  return diagnostics;
}
