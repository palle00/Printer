import {
  createPrintProgress,
  estimateTestDurationSeconds,
} from "../../print/printMath";

import type {
  RealPrintPayload,
  TestPrintPayload,
} from "../../types/printer-ipc";

import type {
  PrinterPosition,
  PrinterStatus,
} from "../../types/printer";

import type {
  PrinterEvents,
  IdlePrinterStatus,
} from "../core/PrinterEvents";

import {
  prepareCommands,
} from "../gcode/prepareCommands";

import type {
  PositionTracker,
} from "../gcode/PositionTracker";

import type {
  SerialQueue,
} from "../serial/SerialQueue";

import type {
  ProgressOptions,
  PrintRunnerContext,
} from "./runnerContext";

import {
  RealPrintRunner,
} from "./RealPrintRunner";

import type {
  PrintSession,
  RealSession,
  TestSession,
} from "./sessionTypes";

import {
  createBaseSession,
  getElapsedMilliseconds,
  isActiveStatus,
  pauseSessionClock,
} from "./sessionUtils";

import {
  TestPrintRunner,
} from "./TestPrintRunner";

const TEST_STOP_DELAY_MS = 300;

interface PrintSessionManagerOptions {
  events: PrinterEvents;

  serialQueue: SerialQueue;

  positionTracker:
    PositionTracker;

  isConnected: () => boolean;
}

export class PrintSessionManager {
  private session:
    PrintSession | null = null;

  private readonly realRunner:
    RealPrintRunner;

  private readonly testRunner:
    TestPrintRunner;

  private testStopTimer:
    ReturnType<
      typeof setTimeout
    > | null = null;

  constructor(
    private readonly options:
      PrintSessionManagerOptions,
  ) {
    const context:
      PrintRunnerContext = {
      isCurrent: (session) =>
        this.session === session,

      setStatus: (
        session,
        status,
      ) => {
        this.setSessionStatus(
          session,
          status,
        );
      },

      emitProgress: (
        session,
        progressOptions,
      ) => {
        this.emitProgress(
          session,
          progressOptions,
        );
      },

      emitPosition: (
        position,
      ) => {
        this.emitPosition(
          position,
        );
      },

      finish: (session) => {
        this.finishSession(
          session,
        );
      },

      stop: (
        session,
        clearSession,
      ) => {
        this.completeStop(
          session,
          clearSession,
        );
      },

      error: (error) => {
        this.options.events.error(
          error,
        );
      },
    };

    this.realRunner =
      new RealPrintRunner(
        this.options.serialQueue,
        context,
      );

    this.testRunner =
      new TestPrintRunner(
        context,
      );
  }

  get isActive(): boolean {
    return (
      this.session !== null &&
      isActiveStatus(
        this.session.status,
      )
    );
  }

  startReal(
    payload: RealPrintPayload,
  ): void {
    if (
      !this.options.isConnected()
    ) {
      this.options.events.error(
        new Error(
          "Connect the printer before starting a real print.",
        ),
      );

      return;
    }

    if (this.isActive) {
      return;
    }

    this.clearPendingTestStop();

    const commands =
      prepareCommands(
        payload.lines,
        payload.totalLayers,
      );

    const session:
      RealSession = {
      ...createBaseSession(
        "real",
        payload.fileName,
        commands.texts.length,
        payload.totalLayers,
      ),

      mode: "real",
      commands,
    };

    this.session = session;

    this.options.events.printStarted(
      "real",

      payload.fileName,

      commands.texts.length,

      payload.totalLayers,
    );

    this.emitProgress(session);

    void this.realRunner.run(
      session,
    );
  }

  startTest(
    payload: TestPrintPayload,
  ): void {
    if (this.isActive) {
      return;
    }

    this.clearPendingTestStop();

    const durationSeconds =
      estimateTestDurationSeconds(
        payload.path.commandIndexes.length,
      );

    const session:
      TestSession = {
      ...createBaseSession(
        "test",

        payload.fileName,

        payload.printableLines,

        payload.totalLayers,
      ),

      mode: "test",

      path:
        payload.path,

      durationMs:
        durationSeconds * 1000,

      timer: null,
    };

    this.session = session;

    this.options.events.printStarted(
      "test",

      payload.fileName,

      payload.printableLines,

      payload.totalLayers,
    );

    this.emitProgress(
      session,
      {
        percentOverride: 0,

        estimatedDurationSeconds:
          durationSeconds,
      },
    );

    const hasFirstSegment =
      payload.path.commandIndexes.length > 0;

    if (hasFirstSegment) {
      this.emitPosition({
        x: payload.path.coordinates[0],
        y: payload.path.coordinates[1],
        z: payload.path.coordinates[2],
        e: 0,
      });
    } else {
      this.options.positionTracker.reset();
    }

    this.testRunner.start(
      session,
    );
  }

  pause(): void {
    const session =
      this.session;

    if (
      !session ||
      session.status !==
        "printing"
    ) {
      return;
    }

    session.pauseRequested = true;

    if (session.mode === "test") {
      this.testRunner.clearTimer(
        session,
      );

      pauseSessionClock(
        session,
      );

      this.setSessionStatus(
        session,
        "paused",
      );

      return;
    }

    this.setSessionStatus(
      session,
      "pausing",
    );
  }

  resume(): void {
    const session =
      this.session;

    if (
      !session ||
      session.status !== "paused"
    ) {
      return;
    }

    session.pauseRequested = false;

    if (session.mode === "test") {
      session.runStartedAtMs =
        performance.now();

      this.setSessionStatus(
        session,
        "printing",
      );

      this.testRunner.start(
        session,
      );

      return;
    }

    session.resumeResolver?.();
  }

  stop(): void {
    const session =
      this.session;

    if (
      !session ||
      !isActiveStatus(
        session.status,
      )
    ) {
      return;
    }

    session.stopRequested = true;

    this.setSessionStatus(
      session,
      "stopping",
    );

    if (session.mode === "test") {
      this.testRunner.clearTimer(
        session,
      );

      this.clearPendingTestStop();

      this.testStopTimer =
        setTimeout(() => {
          this.testStopTimer = null;

          if (
            this.session !==
            session
          ) {
            return;
          }

          this.completeStop(
            session,
            true,
          );
        }, TEST_STOP_DELAY_MS);

      return;
    }

    /*
     * Releases a real print that is
     * currently waiting in paused state.
     */
    session.resumeResolver?.();
  }

  reset(): void {
    if (this.isActive) {
      return;
    }

    this.clearPendingTestStop();

    if (
      this.session?.mode ===
      "test"
    ) {
      this.testRunner.clearTimer(
        this.session,
      );
    }

    this.session = null;

    this.options.positionTracker.reset();

    this.options.events.printReset(
      this.getIdleStatus(),
    );
  }

  handleDisconnect(): void {
    this.clearPendingTestStop();

    const session =
      this.session;

    if (!session) {
      return;
    }

    if (session.mode === "test") {
      this.testRunner.clearTimer(
        session,
      );
    } else {
      session.stopRequested = true;

      session.resumeResolver?.();
    }

    /*
     * Mark the session as no longer current.
     * Any pending real-print promise will
     * terminate without publishing stale events.
     */
    this.session = null;
  }

  private emitPosition(
    position: PrinterPosition,
  ): void {
    this.options.positionTracker.set(
      position,
    );
  }

  private emitProgress(
    session: PrintSession,
    progressOptions?:
      ProgressOptions,
  ): void {
    if (this.session !== session) {
      return;
    }

    const elapsedSeconds =
      getElapsedMilliseconds(
        session,
      ) / 1000;

    const progress =
      createPrintProgress({
        fileName:
          session.fileName,

        currentLine:
          session.currentLine,

        totalLines:
          session.totalLines,

        currentLayer:
          session.currentLayer,

        totalLayers:
          session.totalLayers,

        elapsedSeconds,

        percentOverride:
          progressOptions
            ?.percentOverride,

        estimatedDurationSeconds:
          progressOptions
            ?.estimatedDurationSeconds,
      });

    this.options.events.progress(
      progress,
    );
  }

  private finishSession(
    session: PrintSession,
  ): void {
    if (this.session !== session) {
      return;
    }

    pauseSessionClock(session);

    session.currentLine =
      session.totalLines;

    session.currentLayer =
      session.totalLayers;

    session.status = "idle";

    this.emitProgress(
      session,

      session.mode === "test"
        ? {
            percentOverride: 100,

            estimatedDurationSeconds:
              session.durationMs /
              1000,
          }
        : {
            percentOverride: 100,
          },
    );

    this.options.events.printFinished(
      session.mode,

      session.elapsedBeforeRunMs /
        1000,
    );
  }

  private completeStop(
    session: PrintSession,
    clearSession: boolean,
  ): void {
    if (this.session !== session) {
      return;
    }

    session.status = "idle";

    const mode =
      clearSession
        ? null
        : session.mode;

    if (clearSession) {
      this.session = null;

      this.options.positionTracker.reset();
    }

    this.options.events.printStopped(
      mode,

      this.getIdleStatus(),

      clearSession,
    );
  }

  private setSessionStatus(
    session: PrintSession,
    status: PrinterStatus,
  ): void {
    if (this.session !== session) {
      return;
    }

    session.status = status;

    this.options.events.status(
      status,
    );
  }

  private getIdleStatus():
    IdlePrinterStatus {
    return this.options.isConnected()
      ? "idle"
      : "disconnected";
  }

  private clearPendingTestStop():
    void {
    if (
      this.testStopTimer === null
    ) {
      return;
    }

    clearTimeout(
      this.testStopTimer,
    );

    this.testStopTimer = null;
  }
}
