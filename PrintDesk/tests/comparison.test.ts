import assert from "node:assert/strict";
import test from "node:test";
import { parseGcode } from "../src/utils/gcodeParser";
import { createComparisonSummary } from "../src/types/gcode-comparison";

test("statistics-only parsing retains metrics without preview geometry", () => {
  const parsed = parseGcode("comparison.gcode", ["G90", "M82", "G1 X10 Y20 Z0.2 E1 F600", "G1 X30 Y40 E2"].join("\n"), { includeGeometry: false });
  const summary = createComparisonSummary(parsed);
  assert.equal(parsed.segments.length, 0);
  assert.equal(summary.pathCount, 2);
  assert.equal(summary.statistics.widthMm, 30);
  assert.equal(summary.statistics.depthMm, 40);
  assert.equal(summary.statistics.heightMm, 0.2);
});
