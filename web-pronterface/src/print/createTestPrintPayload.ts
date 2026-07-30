import type { ParsedGcode } from "../types/gcode";
import type { TestPrintPayload } from "../types/printer-ipc";

export function createTestPrintPayload(
  gcode: ParsedGcode,
): TestPrintPayload {
  return {
    fileName: gcode.fileName,
    printableLines: gcode.printableLines,
    totalLayers: gcode.totalLayers,
    path: {
      coordinates: gcode.segments.coordinates,
      commandIndexes: gcode.segments.commandIndexes,
      layers: gcode.segments.layers,
      extruding: gcode.segments.extruding,
    },
  };
}
