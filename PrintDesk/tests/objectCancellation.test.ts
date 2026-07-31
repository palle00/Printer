import assert from "node:assert/strict";
import test from "node:test";
import { parseGcode } from "../src/utils/gcodeParser";

test("Marlin M486 metadata exposes bounded native cancellation objects", () => {
  const parsed = parseGcode("marlin.gcode", "M486 T2\nM486 S0\nG1 X1 E1\nM486 S1\nG1 X2 E2\nM486 S-1");
  assert.equal(parsed.objectCancellationProtocol, "marlin-m486");
  assert.deepEqual(parsed.cancelableObjects, [{ id: "0", name: "Object 1" }, { id: "1", name: "Object 2" }]);
});

test("Klipper metadata exposes only command-safe object names", () => {
  const parsed = parseGcode("klipper.gcode", ["EXCLUDE_OBJECT_DEFINE NAME=left_part CENTER=1,1", "EXCLUDE_OBJECT_DEFINE NAME=right-part CENTER=2,2", "EXCLUDE_OBJECT_DEFINE NAME=bad;M112"].join("\n"));
  assert.equal(parsed.objectCancellationProtocol, "klipper");
  assert.deepEqual(parsed.cancelableObjects, [{ id: "left_part", name: "left part" }, { id: "right-part", name: "right-part" }, { id: "bad", name: "bad" }]);
});
