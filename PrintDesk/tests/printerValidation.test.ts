import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBaudRate,
  assertRealPrintPayload,
  assertSerialPortPath,
  assertTestPrintPayload,
} from "../electron/main/printer/printerIpcValidation";

test("printer IPC validation bounds serial connection values", () => {
  assert.equal(assertBaudRate(undefined), 115200);
  assert.equal(assertBaudRate("250000"), 250000);
  assert.equal(assertSerialPortPath("COM12"), "COM12");
  assert.throws(() => assertBaudRate(0), /baud rate/);
  assert.throws(() => assertSerialPortPath(""), /serial port/);
});

test("real-print validation accepts aligned typed timelines", () => {
  assert.doesNotThrow(() =>
    assertRealPrintPayload({
      source: { path: "C:\\part.gcode", size: 128, sha256: "a".repeat(64) },
      commandLayers: new Uint32Array([1, 2]),
      totalLayers: 2,
      timing: {
        cumulativeSeconds: new Float32Array([0, 1, 2]),
        totalSeconds: 2,
        heatingSeconds: 0,
        source: "motion",
        confidence: "medium",
      },
    }),
  );
});

test("print payload validation rejects mismatched compact arrays", () => {
  assert.throws(
    () =>
      assertTestPrintPayload({
        fileName: "part.gcode",
        totalLayers: 1,
        printableLines: 1,
        path: {
          coordinates: new Float32Array(5),
          commandIndexes: new Uint32Array(1),
          layers: new Uint32Array(1),
          extruding: new Uint8Array(1),
        },
      }),
    /Invalid test-print payload/,
  );
});
