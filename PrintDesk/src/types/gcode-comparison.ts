import type { GcodeStatistics, ParsedGcode } from "./gcode";

export interface GcodeComparisonSummary {
  fileName: string;
  totalLines: number;
  totalLayers: number;
  printableLines: number;
  pathCount: number;
  statistics: GcodeStatistics;
}

export function createComparisonSummary(gcode: ParsedGcode): GcodeComparisonSummary {
  return { fileName: gcode.fileName, totalLines: gcode.totalLines, totalLayers: gcode.totalLayers, printableLines: gcode.printableLines, pathCount: gcode.statistics.featureBreakdown.reduce((total, feature) => total + feature.pathCount, 0), statistics: gcode.statistics };
}
