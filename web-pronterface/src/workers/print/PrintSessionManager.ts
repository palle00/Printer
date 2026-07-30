import type {
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
  RealPrintJob,
} from "./realPrintJob";
import {
  releaseSessionResources,
} from "./sessionResources";
import {
  createRealSession,
  createTestSession,
  isRealPrintJobConsistent,
} from "./sessionFactory";
import {
  clearRealProgressTimer,
  emitSessionProgress,
  finalizeFinishedSession,
} from "./sessionLifecycle";

import type {
  PrintSession,
} from "./sessionTypes";

import {
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
    payload: RealPrintJob,
  ): void {
    if (
      !this.options.isConnected()
    ) {
      this.options.events.error(
        new Error(
          "Connect the printer before starting a real print.",
        ),
      );
      void payload.commandSource
        .close();

      return;
    }

    if (this.isActive) {
      void payload.commandSource
        .close();
      return;
    }

    this.clearPendingTestStop();

    if (!isRealPrintJobConsistent(
      payload,
    )) {
      this.options.events.error(
        new Error(
          "The print timing model does not match the G-code commands.",
        ),
      );
      void payload.commandSource
        .close();
      return;
    }

    const session =
      createRealSession(payload);

    this.session = session;

    this.options.events.printStarted(
      "real",

      payload.fileName,

      payload.commandLayers.length,

      payload.totalLayers,
    );

    this.emitProgress(
      session,
      {
        force: true,
      },
    );
    session.progressTimer =
      setInterval(
        () => {
          this.emitProgress(
            session,
          );
        },
        250,
      );

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

    const {
      session,
      durationSeconds,
      initialPosition,
    } = createTestSession(payload);

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

    if (initialPosition) {
      this.emitPosition(
        initialPosition,
      );
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
    this.options.serialQueue.reset(
      new Error(
        "The active print was stopped.",
      ),
    );
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

    if (this.session) {
      releaseSessionResources(
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
      clearRealProgressTimer(
        session,
      );
      session.stopRequested = true;

      session.resumeResolver?.();
    }

    releaseSessionResources(
      session,
    );

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

    emitSessionProgress(
      this.options.events,
      session,
      progressOptions,
    );
  }

  private finishSession(
    session: PrintSession,
  ): void {
    if (this.session !== session) {
      return;
    }

    finalizeFinishedSession(
      this.options.events,
      session,
    );
  }

  private completeStop(
    session: PrintSession,
    clearSession: boolean,
  ): void {
    if (this.session !== session) {
      return;
    }

    if (session.mode === "real") {
      clearRealProgressTimer(
        session,
      );
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
    releaseSessionResources(
      session,
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
