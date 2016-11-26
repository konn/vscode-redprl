import * as vs from "vscode";
import Session from "../session";

export default function(session: Session): (event: vs.TextDocumentChangeEvent) => Promise<void> {
  return async ({ document }) => {
    if (document.languageId !== "redprl") return;
    await session.refreshDebounced(document);
  };
}
