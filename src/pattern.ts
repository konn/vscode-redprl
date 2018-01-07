export default class Patterns {
  public static headerLine = /^(.*?):(\d+)[.](\d+)-(\d+)[.](\d+)\s*\[(Info|Output|Warning|Error)\]/;
  public static remainingObligations = /(\d+)\s*\b(Remaining Obligations)\b/u;
}
