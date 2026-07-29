import type {
  PrintMode,
  PrinterStatus,
} from "../../types/printer";

import type {
  BaseSession,
  PrintSession,
} from "./sessionTypes";

export function isActiveStatus(
  status: PrinterStatus,
): boolean {
  return (
    status === "printing" ||
    status === "pausing" ||
    status === "paused" ||
    status === "stopping"
  );
}

export function getElapsedMilliseconds(
  session: PrintSession,
): number {
  const clockIsRunning =
    session.status === "printing" ||
    session.status === "pausing" ||
    session.status === "stopping";

  return (
    session.elapsedBeforeRunMs +
    (
      clockIsRunning
        ? performance.now() -
          session.runStartedAtMs
        : 0
    )
  );
}

export function pauseSessionClock(
  session: PrintSession,
): void {
  session.elapsedBeforeRunMs =
    getElapsedMilliseconds(
      session,
    );
}

export function createBaseSession(
  mode: Exclude<
    PrintMode,
    null
  >,

  fileName: string,
  totalLines: number,
  totalLayers: number,
): BaseSession {
  return {
    mode,
    status: "printing",

    fileName,

    totalLines,
    totalLayers,

    currentLine: 0,

    currentLayer:
      totalLayers > 0
        ? 1
        : 0,

    elapsedBeforeRunMs: 0,

    runStartedAtMs:
      performance.now(),

    pauseRequested: false,
    stopRequested: false,

    resumeResolver: null,
  };
}