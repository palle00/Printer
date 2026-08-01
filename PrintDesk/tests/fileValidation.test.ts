import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  MAXIMUM_GCODE_FILE_SIZE,
  assertGcodeFileSize,
  assertGcodePath,
  isSupportedGcodePath,
} from "../electron/main/files/gcodeFileValidation";

test("G-code file validation accepts supported extensions case-insensitively", () => {
  assert.equal(isSupportedGcodePath("part.GCODE"), true);
  assert.equal(isSupportedGcodePath("part.3mf"), false);
  const absolute = path.resolve("fixture.gc");
  assert.equal(assertGcodePath(absolute), path.normalize(absolute));
});

test("G-code file validation rejects relative paths and unsafe sizes", () => {
  assert.throws(() => assertGcodePath("relative.gcode"), /Choose a G-code/);
  assert.throws(() => assertGcodeFileSize(0), /empty/);
  assert.throws(() => assertGcodeFileSize(MAXIMUM_GCODE_FILE_SIZE + 1), /too large/);
  assert.doesNotThrow(() => assertGcodeFileSize(MAXIMUM_GCODE_FILE_SIZE));
});
