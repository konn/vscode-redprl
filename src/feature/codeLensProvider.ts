import * as vs from "vscode";
import Session from "../session";

export default function(session: Session): vs.CodeLensProvider {
  return {
    provideCodeLenses: async document => {
      if (document.languageId !== "redprl") return [];
      await session.refreshImmediate(document);
      return session.lenses.get(document.uri.toString()) || [];
    },
  };
}
