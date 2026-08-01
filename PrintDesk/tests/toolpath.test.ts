import assert from "node:assert/strict";
import test from "node:test";

import {
  buildToolpathData,
} from "../src/components/gcode-viewer/toolpath";
import {
  parseGcode,
} from "../src/utils/gcodeParser";

test(
  "small previews retain every source segment exactly",
  async () => {
    const parsed = parseGcode(
      "small.gcode",
      [
        "G90",
        "M82",
        "G1 X10 Y10 Z0.2 E1 F1200",
        "G1 X20 Y10 E2",
        "G0 X30 Y20",
      ].join("\n"),
    );
    const preview =
      await buildToolpathData(
        parsed,
        new AbortController()
          .signal,
      );

    assert.deepEqual(
      Array.from(preview.positions),
      Array.from(
        parsed.segments.coordinates,
      ),
    );
    assert.equal(
      preview.positions.length / 6,
      parsed.segments.length,
    );
    assert.equal(
      preview.layerVertexOffsets.at(-1),
      parsed.segments.length * 2,
    );
  },
);
