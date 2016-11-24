import * as vs from "vscode";
import Session from "../session";

export default function(session: Session): vs.DocumentSymbolProvider {
  return {
    provideDocumentSymbols: async (document) => {
      if (document.languageId !== "redprl") return;
      if (!session.symbols.has(document.uri.toString())) await session.refreshImmediate(document);
      return session.symbols.get(document.uri.toString());
    },
  };
}
