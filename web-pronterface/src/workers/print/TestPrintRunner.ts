import {
  calculateTestFrame,
} from "../../print/printMath";

import type {
  PrintRunnerContext,
} from "./runnerContext";

import type {
  TestSession,
} from "./sessionTypes";

import {
  getElapsedMilliseconds,
} from "./sessionUtils";

const TEST_FRAME_INTERVAL_MS = 32;

export class TestPrintRunner {
  constructor(
    private readonly context:
      PrintRunnerContext,
  ) {}

  start(
    session: TestSession,
  ): void {
    this.scheduleFrame(session);
  }

  clearTimer(
    session: TestSession,
  ): void {
    if (session.timer === null) {
      return;
    }

    clearTimeout(
      session.timer,
    );

    session.timer = null;
  }

  private scheduleFrame(
    session: TestSession,
  ): void {
    this.clearTimer(session);

    session.timer = setTimeout(
      () => {
        this.runFrame(session);
      },

      TEST_FRAME_INTERVAL_MS,
    );
  }

  private runFrame(
    session: TestSession,
  ): void {
    session.timer = null;

    if (
      !this.context.isCurrent(
        session,
      ) ||
      session.status !==
        "printing"
    ) {
      return;
    }

    const elapsedMilliseconds =
      getElapsedMilliseconds(
        session,
      );

    const frame =
      calculateTestFrame(
        session.path,

        session.totalLines,
        session.totalLayers,

        elapsedMilliseconds,
        session.durationMs,
      );

    session.currentLine =
      frame.currentLine;

    session.currentLayer =
      frame.currentLayer;

    this.context.emitPosition(
      frame.position,
    );

    this.context.emitProgress(
      session,
      {
        percentOverride:
          frame.ratio * 100,

        estimatedDurationSeconds:
          session.durationMs /
          1000,
      },
    );

    if (frame.finished) {
      this.context.finish(
        session,
      );

      return;
    }

    this.scheduleFrame(
      session,
    );
  }
}
