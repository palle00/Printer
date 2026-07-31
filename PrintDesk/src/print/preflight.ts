import type { ParsedGcode } from "../types/gcode";
import type { FilamentSpool, PrinterProfile } from "../types/operations";

export type PreflightSeverity = "error" | "warning" | "info";

export interface PreflightIssue {
  code: string;
  severity: PreflightSeverity;
  message: string;
}

export function inspectPrint(
  gcode: ParsedGcode,
  profile: PrinterProfile,
  spool: FilamentSpool | null,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const stats = gcode.statistics;

  if (gcode.minX < 0 || gcode.minY < 0 || gcode.maxX > profile.bedWidthMm || gcode.maxY > profile.bedDepthMm) {
    issues.push({ code: "build-area", severity: "error", message: `Toolpath exceeds the ${profile.bedWidthMm} x ${profile.bedDepthMm} mm build area.` });
  }
  if (gcode.minZ < 0 || gcode.maxZ > profile.maximumHeightMm) {
    issues.push({ code: "build-height", severity: "error", message: `Toolpath exceeds the ${profile.maximumHeightMm} mm build height.` });
  }
  if ((stats.maximumHotendTemperatureCelsius ?? 0) > profile.maximumHotendCelsius) {
    issues.push({ code: "hotend-temperature", severity: "error", message: `Requested hotend temperature exceeds ${profile.maximumHotendCelsius} C.` });
  }
  if ((stats.maximumBedTemperatureCelsius ?? 0) > profile.maximumBedCelsius) {
    issues.push({ code: "bed-temperature", severity: "error", message: `Requested bed temperature exceeds ${profile.maximumBedCelsius} C.` });
  }
  if (spool && stats.filamentWeightGrams > spool.remainingGrams) {
    issues.push({ code: "filament", severity: "error", message: `The active spool is short by ${(stats.filamentWeightGrams - spool.remainingGrams).toFixed(1)} g.` });
  } else if (!spool) {
    issues.push({ code: "no-spool", severity: "info", message: "No filament spool is selected; availability cannot be checked." });
  }
  if (gcode.printableLines === 0 || gcode.segments.length === 0) {
    issues.push({ code: "empty-toolpath", severity: "error", message: "The file contains no printable toolpath." });
  }
  return issues;
}

export function canPrintAfterPreflight(issues: readonly PreflightIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "error");
}
