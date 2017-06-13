export default class Pattern {
  public static diagnostic = /^(.*?):(\d+)[.](\d+)-(\d+)[.](\d+)\s*\[(Error|Info|Output|Warning)\]:\n[ ]{2}([\s\S]*?\n)\s*^\s*(?:(?=-)(?:.*\n){6}\s*([\s\S]*?))?(?=\s*\n{2})/gmu;
  public static remainingObligations = /(\d+)\s*\b(Remaining Obligations)\b/u;
  public static symbol = /^\b(Def|Tac|Thm)\b\s*\b([\w\-\/]+)\b/u;
}
