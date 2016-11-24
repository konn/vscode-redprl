import * as vs from "vscode";
import Session from "../session";

export default function(session: Session): (event: vs.TextDocumentChangeEvent) => Promise<void> {
  return async (event) => await session.refreshDebounced(event.document);
}
