import type {
  PrinterEvents,
} from "../core/PrinterEvents";
import type {
  ProgressOptions,
} from "./runnerContext";
import {
  releaseSessionResources,
} from "./sessionResources";
import {
  createCompletionResult,
  createSessionProgress,
} from "./sessionProgress";
import type {
  PrintSession,
  RealSession,
} from "./sessionTypes";
import {
  pauseSessionClock,
} from "./sessionUtils";

export function clearRealProgressTimer(
  session: RealSession,
): void {
  if (session.progressTimer === null) {
    return;
  }

  clearInterval(
    session.progressTimer,
  );
  session.progressTimer = null;
}

export function emitSessionProgress(
  events: PrinterEvents,
  session: PrintSession,
  options?: ProgressOptions,
): void {
  const now = performance.now();

  if (
    session.mode === "real" &&
    !options?.force &&
    now -
      session.lastProgressEmitAtMs <
      1_000
  ) {
    return;
  }

  if (session.mode === "real") {
    session.lastProgressEmitAtMs =
      now;
  }

  events.progress(
    createSessionProgress(
      session,
      options,
    ),
  );
}

export function finalizeFinishedSession(
  events: PrinterEvents,
  session: PrintSession,
): void {
  pauseSessionClock(session);

  if (session.mode === "real") {
    clearRealProgressTimer(
      session,
    );
  }

  session.currentLine =
    session.totalLines;
  session.currentLayer =
    session.totalLayers;
  session.status = "idle";

  emitSessionProgress(
    events,
    session,
    session.mode === "test"
      ? {
          percentOverride: 100,
          estimatedDurationSeconds:
            session.durationMs / 1000,
        }
      : {
          percentOverride: 100,
          force: true,
        },
  );

  const completion =
    createCompletionResult(
      session,
    );

  events.printFinished(
    session.mode,
    completion.elapsedSeconds,
    completion.metrics,
  );
  releaseSessionResources(
    session,
  );
}
