import * as vs from "vscode";
import Session from "../session";

export default function(session: Session): () => void {
  return () => ((session as any).config = vs.workspace.getConfiguration("redprl"));
}
