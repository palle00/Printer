import type {
  RealPrintPayload,
  TestPrintPayload,
} from "../../../src/types/printer-ipc";
import {
  MAXIMUM_GCODE_FILE_SIZE,
} from "../files/gcodeFileValidation";

const SHA256_PATTERN =
  /^[a-f0-9]{64}$/;

export function assertBaudRate(value: unknown): number {
  const baudRate = value === undefined ? 115200 : Number(value);

  if (
    !Number.isInteger(baudRate) ||
    baudRate < 1200 ||
    baudRate > 2_000_000
  ) {
    throw new Error("Invalid serial baud rate.");
  }

  return baudRate;
}

export function assertSerialPortPath(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 512
  ) {
    throw new Error("Invalid serial port.");
  }

  return value;
}

export function assertRealPrintPayload(
  value: unknown,
): asserts value is RealPrintPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid real-print payload.");
  }

  const print = value as Partial<RealPrintPayload>;
  const source = print.source;

  if (
    !source ||
    typeof source !== "object" ||
    typeof source.path !== "string" ||
    source.path.trim().length === 0 ||
    source.path.length > 32_767 ||
    !Number.isSafeInteger(source.size) ||
    source.size <= 0 ||
    source.size >
      MAXIMUM_GCODE_FILE_SIZE ||
    typeof source.sha256 !==
      "string" ||
    !SHA256_PATTERN.test(
      source.sha256,
    )
  ) {
    throw new Error(
      "Print payload contains an invalid file fingerprint.",
    );
  }

  if (
    !(
      print.commandLayers instanceof
      Uint32Array
    )
  ) {
    throw new Error(
      "Print payload contains invalid command layers.",
    );
  }

  if (
    !Number.isInteger(print.totalLayers) ||
    (print.totalLayers ?? -1) < 0
  ) {
    throw new Error("Print payload contains an invalid layer count.");
  }

  if (
    print.commandLayers.some(
      (layer) =>
        layer < 1 ||
        layer >
          (print.totalLayers ?? 0),
    )
  ) {
    throw new Error(
      "Print payload contains invalid command layers.",
    );
  }

  const timing = print.timing;

  if (
    !timing ||
    !(
      timing.cumulativeSeconds instanceof
      Float32Array
    ) ||
    timing.cumulativeSeconds.length < 1 ||
    timing.cumulativeSeconds.length !==
      print.commandLayers.length + 1 ||
    typeof timing.totalSeconds !== "number" ||
    !Number.isFinite(timing.totalSeconds) ||
    timing.totalSeconds < 0 ||
    typeof timing.heatingSeconds !== "number" ||
    !Number.isFinite(timing.heatingSeconds) ||
    timing.heatingSeconds < 0 ||
    timing.heatingSeconds >
      timing.totalSeconds ||
    (timing.source !== "slicer" &&
      timing.source !== "motion") ||
    (timing.confidence !== "low" &&
      timing.confidence !== "medium" &&
      timing.confidence !== "high")
  ) {
    throw new Error(
      "Print payload contains an invalid timing model.",
    );
  }
}

export function assertTestPrintPayload(
  value: unknown,
): asserts value is TestPrintPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid test-print payload.");
  }

  const print = value as Partial<TestPrintPayload>;
  const path = print.path;

  if (
    typeof print.fileName !== "string" ||
    print.fileName.trim().length === 0 ||
    !Number.isInteger(print.totalLayers) ||
    (print.totalLayers ?? -1) < 0 ||
    !Number.isInteger(print.printableLines) ||
    (print.printableLines ?? -1) < 0 ||
    !path ||
    !(path.coordinates instanceof Float32Array) ||
    !(path.commandIndexes instanceof Uint32Array) ||
    !(path.layers instanceof Uint32Array) ||
    !(path.extruding instanceof Uint8Array) ||
    path.coordinates.length !== path.commandIndexes.length * 6 ||
    path.layers.length !== path.commandIndexes.length ||
    path.extruding.length !== path.commandIndexes.length
  ) {
    throw new Error("Invalid test-print payload.");
  }
}
