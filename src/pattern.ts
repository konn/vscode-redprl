export default class Pattern {
  public static diagnostic = /^(.*?):(\d+)[.](\d+)-(\d+)[.](\d+)\s*\[(Error|Info|Output|Warning)\]:\n[ ]{2}([\s\S]*?\n)\s*^\s*(?:(?=-)(?:.*\n){6}\s*([\s\S]*?))?(?=\s*\n{2})/gmu;
  public static goal = /[ ]{2}Goal\s*(\d+)[.]\n([\s\S]*?)(?=\s*Goal|$)/gu;
  public static goalItem = /^[ ]{4}(.*)$/gmu;
  public static symbol = /^\b(Def|Tac|Thm)\b\s*\b([\w\-\/]+)\b/u;
}
