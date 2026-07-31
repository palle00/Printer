export type ConsoleDetailLevel = "essential" | "standard" | "all";

export type ConsoleLineKind =
  | "command"
  | "error"
  | "response"
  | "routine"
  | "system"
  | "warning";

export interface ConsoleLine {
  kind: ConsoleLineKind;
  text: string;
}

const ERROR_PATTERN = /^(?:!!|error\b|fatal\b)|(?:failed|invalid command|unknown command)/i;
const WARNING_PATTERN = /^(?:warn(?:ing)?\b|echo:busy\b|busy\b|wait\b)/i;
const ROUTINE_PATTERN = /^(?:ok\b|T:\s|B:\s|X:\s*-?\d|echo:SD card ok)/i;

export function classifyConsoleLine(text: string): ConsoleLine {
  if (text.startsWith(">> ")) return { kind: "system", text };
  if (text.startsWith("> ")) return { kind: "command", text };
  if (ERROR_PATTERN.test(text)) return { kind: "error", text };
  if (WARNING_PATTERN.test(text)) return { kind: "warning", text };
  if (ROUTINE_PATTERN.test(text)) return { kind: "routine", text };
  return { kind: "response", text };
}

export function shouldShowConsoleLine(
  line: ConsoleLine,
  detailLevel: ConsoleDetailLevel,
): boolean {
  if (detailLevel === "all") return true;
  if (detailLevel === "essential") {
    return ["error", "system", "warning"].includes(line.kind);
  }
  return line.kind !== "routine";
}
