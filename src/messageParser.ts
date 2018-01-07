import * as vs from "vscode";

type MessageKind = "Info" | "Output" | "Warning" | "Error";

export interface IMessage {
  kind: MessageKind;
  path: string;
  range: vs.Range;
  content: string[];
}

const headerLinePattern = /^(.*?):(\d+)[.](\d+)-(\d+)[.](\d+)\s*\[(Info|Output|Warning|Error)\]/;

export function parseMessages(response: string): IMessage[] {
  const lines = response.split("\n");
  const messages: IMessage[] = [];
  while (lines.length > 0) {
    const headerLine = lines.shift() as string;
    const match = headerLine.match(headerLinePattern);
    if (!match) {
      continue;
    }
    const path = match[1];
    const startLine = parseInt(match[2] as string, 10) - 1;
    const startChar = parseInt(match[3] as string, 10) - 1;
    const endLine = parseInt(match[4] as string, 10) - 1;
    const endChar = parseInt(match[5] as string, 10) - 1;
    const range = new vs.Range(startLine, startChar, endLine, endChar);
    const kind = match[6] as MessageKind;
    const content = [];
    while (lines.length > 0) {
      const contentLine = lines.shift() as string;
      if (!/^\s\s/.test(contentLine)) {
        break;
      }
      content.push(contentLine.slice(2));
    }
    messages.push({ kind, path, range, content });
  }
  return messages;
}
