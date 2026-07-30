import assert from "node:assert/strict";
import test from "node:test";

import {
  parseGcode,
} from "../src/utils/gcodeParser";

test(
  "markerless parsing assigns every command its inferred layer",
  () => {
    const parsed = parseGcode(
      "markerless.gcode",
      [
        "G21",
        "G90",
        "M82",
        "G1 Z0.2",
        "G1 X1 E1",
        "G1 Z0.4",
        "G1 X2 E2",
        "M104 S200",
      ].join("\n"),
    );

    assert.deepEqual(
      Array.from(
        parsed.commandLayers,
      ),
      [
        1,
        1,
        1,
        1,
        1,
        1,
        2,
        2,
      ],
    );
    assert.equal(
      parsed.commandLayers.length,
      parsed.printableLines,
    );
    assert.equal(
      parsed.totalLayers,
      2,
    );

    const secondLayerCommand =
      parsed.segments.commandIndexes
        .findIndex(
          (commandIndex) =>
            commandIndex === 7,
        );

    assert.notEqual(
      secondLayerCommand,
      -1,
    );
    assert.equal(
      parsed.segments.layers[
        secondLayerCommand
      ],
      2,
    );
  },
);

test(
  "arc parsing tessellates I/J and radius commands without changing command alignment",
  () => {
    const parsed = parseGcode(
      "arcs.gcode",
      [
        "G21",
        "G90",
        "M82",
        "G1 X0 Y0 Z0.2",
        "G2 X10 Y0 I5 J0 E1 F600",
        "G3 X0 Y0 R5 E2",
      ].join("\n"),
    );
    const commandIndexes =
      Array.from(
        parsed.segments
          .commandIndexes,
      );

    assert.equal(
      commandIndexes.filter(
        (index) => index === 5,
      ).length,
      11,
    );
    assert.equal(
      commandIndexes.filter(
        (index) => index === 6,
      ).length,
      11,
    );
    assert.equal(
      parsed.segments.length,
      23,
    );
    assert.deepEqual(
      Array.from(
        parsed.commandLayers,
      ),
      [
        1,
        1,
        1,
        1,
        1,
        1,
      ],
    );

    const lastCoordinateOffset =
      (
        parsed.segments.length -
        1
      ) * 6;

    assert.equal(
      parsed.segments.coordinates[
        lastCoordinateOffset + 3
      ],
      0,
    );
    assert.equal(
      parsed.segments.coordinates[
        lastCoordinateOffset + 4
      ],
      0,
    );
    assert.ok(
      Math.abs(
        parsed.segments.coordinates[
          lastCoordinateOffset + 5
        ] - 0.2,
      ) < 0.000001,
    );
  },
);
