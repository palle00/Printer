import {
  createLiveCalibrationState,
} from "../../print/liveEta";
import {
  estimateTestDurationSeconds,
} from "../../print/printMath";
import type {
  PrinterPosition,
} from "../../types/printer";
import type {
  TestPrintPayload,
} from "../../types/printer-ipc";
import type {
  RealPrintJob,
} from "./realPrintJob";
import type {
  RealSession,
  TestSession,
} from "./sessionTypes";
import {
  createBaseSession,
} from "./sessionUtils";

interface CreatedTestSession {
  session: TestSession;
  durationSeconds: number;
  initialPosition:
    PrinterPosition | null;
}

export function isRealPrintJobConsistent(
  payload: RealPrintJob,
): boolean {
  return (
    payload.timing
      .cumulativeSeconds.length ===
    payload.commandLayers.length + 1
  );
}

export function createRealSession(
  payload: RealPrintJob,
): RealSession {
  return {
    ...createBaseSession(
      "real",
      payload.fileName,
      payload.commandLayers.length,
      payload.totalLayers,
    ),
    mode: "real",
    commandSource:
      payload.commandSource,
    commandLayers:
      payload.commandLayers,
    timing: payload.timing,
    calibration:
      createLiveCalibrationState(),
    heatingCompletedAtActiveSeconds:
      null,
    lastProgressEmitAtMs: 0,
    lastCalibratedTotalSeconds:
      payload.timing.totalSeconds,
    progressTimer: null,
  };
}

export function createTestSession(
  payload: TestPrintPayload,
): CreatedTestSession {
  const durationSeconds =
    estimateTestDurationSeconds(
      payload.path.commandIndexes.length,
    );
  const hasFirstSegment =
    payload.path.commandIndexes.length > 0;

  return {
    durationSeconds,
    session: {
      ...createBaseSession(
        "test",
        payload.fileName,
        payload.printableLines,
        payload.totalLayers,
      ),
      mode: "test",
      path: payload.path,
      durationMs:
        durationSeconds * 1000,
      timer: null,
    },
    initialPosition:
      hasFirstSegment
        ? {
            x:
              payload.path
                .coordinates[0],
            y:
              payload.path
                .coordinates[1],
            z:
              payload.path
                .coordinates[2],
            e: 0,
          }
        : null,
  };
}
