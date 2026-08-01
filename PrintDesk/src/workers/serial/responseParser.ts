import type {
  PrinterFault,
  PrinterPosition,
} from "../../types/printer";
import { parseMarlinResendRequest } from "./marlinProtocol";

export interface ParsedTemperature {
  timestamp: number;

  hotend?: number;
  targetHotend?: number;

  bed?: number;
  targetBed?: number;
}

export interface ParsedPrinterResponse {
  acknowledge: boolean;

  error: Error | null;

  temperature:
    | ParsedTemperature
    | null;

  position:
    | PrinterPosition
    | null;

  resendLine: number | null;
  fault: PrinterFault | null;
}

function parseFault(line: string): PrinterFault | null {
  const normalized = line.toLowerCase();
  const match = normalized.includes("thermal runaway")
    ? ["thermal-runaway", "critical", "Thermal runaway detected"] as const
    : normalized.includes("heating failed") || normalized.includes("heating error")
      ? ["heating-failed", "critical", "Printer failed to reach temperature"] as const
      : normalized.includes("filament runout") || normalized.includes("filament sensor triggered")
        ? ["filament-runout", "warning", "Filament runout detected"] as const
        : normalized.includes("homing failed") || normalized.includes("homing error")
          ? ["homing-failed", "critical", "Printer homing failed"] as const
          : normalized.includes("printer halted") || normalized.includes("kill() called") || normalized.startsWith("!!")
            ? ["printer-killed", "critical", "Printer entered a halted state"] as const
            : normalized.startsWith("error:")
              ? ["firmware-error", "critical", line] as const
              : null;
  if (!match) return null;
  return {
    code: match[0],
    severity: match[1],
    message: match[2],
    rawLine: line,
    timestamp: Date.now(),
  };
}

function parseAxisValue(
  text: string,
  axis: "X" | "Y" | "Z" | "E",
): number | null {
  const match = text.match(
    new RegExp(
      `(?:^|\\s)${axis}:\\s*([-+]?\\d*\\.?\\d+)`,
      "i",
    ),
  );

  if (!match) {
    return null;
  }

  const value = Number(match[1]);

  return Number.isFinite(value)
    ? value
    : null;
}

function parseTemperature(
  line: string,
): ParsedTemperature | null {
  const hotendMatch = line.match(
    /(?:^|\s)T:([-+]?\d*\.?\d+)\s*\/\s*([-+]?\d*\.?\d+)/i,
  );

  const bedMatch = line.match(
    /(?:^|\s)B:([-+]?\d*\.?\d+)\s*\/\s*([-+]?\d*\.?\d+)/i,
  );

  if (!hotendMatch && !bedMatch) {
    return null;
  }

  return {
    timestamp: Date.now(),

    hotend: hotendMatch
      ? Number(hotendMatch[1])
      : undefined,

    targetHotend: hotendMatch
      ? Number(hotendMatch[2])
      : undefined,

    bed: bedMatch
      ? Number(bedMatch[1])
      : undefined,

    targetBed: bedMatch
      ? Number(bedMatch[2])
      : undefined,
  };
}

function parsePosition(
  line: string,
  currentExtrusion: number,
): PrinterPosition | null {
  const x = parseAxisValue(
    line,
    "X",
  );

  const y = parseAxisValue(
    line,
    "Y",
  );

  const z = parseAxisValue(
    line,
    "Z",
  );

  if (
    x === null ||
    y === null ||
    z === null
  ) {
    return null;
  }

  const e = parseAxisValue(
    line,
    "E",
  );

  return {
    x,
    y,
    z,
    e: e ?? currentExtrusion,
  };
}

export function parsePrinterResponse(
  rawLine: string,
  currentExtrusion: number,
): ParsedPrinterResponse {
  const line = rawLine.trim();

  return {
    acknowledge:
      /^ok\b/i.test(line),

    error:
      /^(?:error|!!)/i.test(line)
        ? new Error(line)
        : null,

    temperature:
      parseTemperature(line),

    position:
      parsePosition(
        line,
        currentExtrusion,
      ),

    resendLine: parseMarlinResendRequest(line),
    fault: parseFault(line),
  };
}
