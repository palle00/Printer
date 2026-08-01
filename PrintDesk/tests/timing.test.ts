import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";

import "./gcodeParser.test";
import "./gcodeFileSource.test";
import "./positionTracker.test";
import "./printerState.test";
import "./safeStop.test";

import {
  estimateMotionSeconds,
  extractSlicerTimeMetadata,
  parseDurationValue,
} from "../src/gcode/timeEstimation";
import {
  createLiveCalibrationState,
  updateLiveEta,
} from "../src/print/liveEta";
import {
  getElapsedMilliseconds,
} from "../src/workers/print/sessionUtils";
import type {
  TestSession,
} from "../src/workers/print/sessionTypes";
import {
  parseGcode,
} from "../src/utils/gcodeParser";
import {
  buildToolpathData,
} from "../src/components/gcode-viewer/toolpath";

const LARGE_FIXTURE_PATH =
  path.join(
    process.cwd(),
    "electron",
    "GcodeTest",
    "test.gcode",
  );

test(
  "motion timing models cruise and short acceleration-limited moves",
  () => {
    assert.equal(
      estimateMotionSeconds(
        100,
        6_000,
        1_000,
      ),
      1.1,
    );
    assert.equal(
      estimateMotionSeconds(
        1,
        6_000,
        1_000,
      ),
      2 * Math.sqrt(1 / 1_000),
    );
  },
);

test(
  "large fixture keeps every print path while bounding its GPU preview",
  {
    skip:
      !existsSync(
        LARGE_FIXTURE_PATH,
      ),
  },
  async () => {
    const text = readFileSync(
      LARGE_FIXTURE_PATH,
      "utf8",
    );
    const parsed = parseGcode(
      "test.gcode",
      text,
    );

    assert.equal(
      parsed.segments.length,
      1_333_927,
    );
    const retainedArrayBytes =
      parsed.segments.coordinates
        .byteLength +
      parsed.segments.commandIndexes
        .byteLength +
      parsed.segments.layers
        .byteLength +
      parsed.segments.extruding
        .byteLength +
      parsed.segments.featureIndexes
        .byteLength +
      parsed.commandLayers.byteLength +
      parsed.timing
        .cumulativeSeconds.byteLength;

    assert.ok(
      retainedArrayBytes <
        64 * 1024 * 1024,
      `Expected compact preview arrays, received ${retainedArrayBytes} bytes.`,
    );
    assert.equal(
      "lines" in parsed,
      false,
    );
    assert.equal(
      parsed.timing
        .cumulativeSeconds.length,
      parsed.printableLines + 1,
    );
    assert.equal(
      parsed.timing.source,
      "slicer",
    );
    assert.equal(
      parsed.timing.totalSeconds,
      14_562,
    );

    const preview =
      await buildToolpathData(
        parsed,
        new AbortController()
          .signal,
      );
    const previewSegmentCount =
      preview.positions.length / 6;

    assert.equal(
      preview.sourceSegmentCount,
      1_333_927,
    );
    assert.ok(
      previewSegmentCount <=
        70_000,
      `Expected a bounded preview mesh, received ${previewSegmentCount} segments.`,
    );
    assert.ok(
      preview.positions.byteLength +
        preview.commandIndexes.byteLength +
        preview.categoryIndexes.byteLength <
        16 * 1024 * 1024,
      "Expected preview GPU attributes to stay below 16 MiB.",
    );
    assert.equal(
      preview.layerVertexOffsets.at(-1),
      previewSegmentCount * 2,
    );
  },
);

test(
  "slicer metadata accepts common duration formats and rejects malformed values",
  () => {
    assert.equal(
      parseDurationValue(
        "1h 2m 3s",
      ),
      3_723,
    );
    assert.equal(
      parseDurationValue(
        "04:02:42",
      ),
      14_562,
    );
    assert.equal(
      parseDurationValue("-8"),
      null,
    );
    assert.deepEqual(
      extractSlicerTimeMetadata(
        "; estimated printing time (normal mode) = 1h 30m",
      ),
      {
        kind: "total",
        seconds: 5_400,
        priority: 4,
      },
    );
  },
);

test(
  "parser handles feed changes, relative positioning, inches, extrusion-only moves, and dwell",
  () => {
    const parsed = parseGcode(
      "timing.gcode",
      [
        "G21",
        "G90",
        "M82",
        "G1 X10 F600",
        "G1 X20 F1200",
        "G91",
        "G20",
        "G1 X1 F60",
        "M83",
        "G1 E1 F60",
        "G4 P2500",
      ].join("\n"),
    );
    const timeline =
      parsed.timing
        .cumulativeSeconds;
    const firstMove =
      timeline[4] - timeline[3];
    const fasterMove =
      timeline[5] - timeline[4];

    assert.ok(
      fasterMove < firstMove,
    );
    assert.ok(
      Math.abs(
        parsed.maxX - 45.4,
      ) < 0.001,
    );
    assert.ok(
      timeline[10] >
        timeline[9],
    );
    assert.ok(
      Math.abs(
        timeline[11] -
          timeline[10] -
          2.5,
      ) < 0.001,
    );
    assert.equal(
      timeline.length,
      parsed.printableLines + 1,
    );
  },
);

test(
  "slicer total scales the command timeline",
  () => {
    const parsed = parseGcode(
      "slicer.gcode",
      [
        ";TIME:600",
        "G1 X100 F6000",
      ].join("\n"),
    );

    assert.equal(
      parsed.timing.source,
      "slicer",
    );
    assert.equal(
      parsed.timing.totalSeconds,
      600,
    );
    assert.equal(
      parsed.timing
        .cumulativeSeconds.at(-1),
      600,
    );
  },
);

test(
  "live ETA waits for meaningful progress and smooths calibration",
  () => {
    const initial =
      createLiveCalibrationState();
    const early = updateLiveEta({
      state: initial,
      actualPrintSeconds: 30,
      predictedPrintElapsedSeconds:
        30,
      predictedPrintTotalSeconds:
        1_000,
      baseSource: "motion",
      baseConfidence: "medium",
    });

    assert.equal(
      early.source,
      "motion",
    );
    assert.equal(
      early.state.factor,
      1,
    );

    const calibrated =
      updateLiveEta({
        state: early.state,
        actualPrintSeconds: 400,
        predictedPrintElapsedSeconds:
          200,
        predictedPrintTotalSeconds:
          1_000,
        baseSource: "motion",
        baseConfidence: "medium",
      });

    assert.equal(
      calibrated.source,
      "live",
    );
    assert.ok(
      calibrated.state.factor >
        1 &&
        calibrated.state.factor <
          2,
    );
    assert.equal(
      calibrated.remainingSeconds,
      800 *
        calibrated.state.factor,
    );

    const complete = updateLiveEta({
      state: calibrated.state,
      actualPrintSeconds: 1_500,
      predictedPrintElapsedSeconds:
        1_000,
      predictedPrintTotalSeconds:
        1_000,
      baseSource: "motion",
      baseConfidence: "medium",
    });
    assert.equal(
      complete.remainingSeconds,
      0,
    );
  },
);

test(
  "paused session elapsed time remains frozen",
  () => {
    const session:
      TestSession = {
      mode: "test",
      status: "paused",
      fileName: "paused.gcode",
      totalLines: 1,
      totalLayers: 1,
      currentLine: 0,
      currentLayer: 1,
      elapsedBeforeRunMs: 12_345,
      runStartedAtMs:
        performance.now() -
        100_000,
      pauseRequested: true,
      stopRequested: false,
      resumeResolver: null,
      path: {
        coordinates:
          new Float32Array(0),
        commandIndexes:
          new Uint32Array(0),
        layers:
          new Uint32Array(0),
        extruding:
          new Uint8Array(0),
      },
      durationMs: 20_000,
      timer: null,
    };

    assert.equal(
      getElapsedMilliseconds(
        session,
      ),
      12_345,
    );
  },
);
