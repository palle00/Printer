import assert from "node:assert/strict";
import test from "node:test";
import { inspectPrint, canPrintAfterPreflight } from "../src/print/preflight";
import { DEFAULT_PRINTER_PROFILE } from "../src/types/operations";
import { parseGcode } from "../src/utils/gcodeParser";

test("preflight blocks a toolpath outside the configured bed", () => {
  const parsed = parseGcode("outside.gcode", "G90\nM82\nG1 X230 Y10 Z0.2 E1");
  const issues = inspectPrint(parsed, DEFAULT_PRINTER_PROFILE, null);
  assert.equal(issues.some((issue) => issue.code === "build-area" && issue.severity === "error"), true);
  assert.equal(canPrintAfterPreflight(issues), false);
});

test("preflight reports insufficient filament", () => {
  const parsed = parseGcode("filament.gcode", "G90\nM82\nG1 X10 Y10 Z0.2 E1000");
  const issues = inspectPrint(parsed, DEFAULT_PRINTER_PROFILE, { id: "spool", name: "PLA", material: "PLA", color: "#ffffff", remainingGrams: 0, costPerKilogram: null, driedAt: null });
  assert.equal(issues.some((issue) => issue.code === "filament"), true);
});
