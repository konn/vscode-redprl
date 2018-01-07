import * as vs from "vscode";
import Session from "../session";

export default function(session: Session): (document: vs.TextDocument) => Promise<void> {
  return async document => {
    if (document.languageId !== "redprl") return;
    if (session.config.enableDiagnosticsOnSave) await session.refreshImmediate(document);
  };
}
