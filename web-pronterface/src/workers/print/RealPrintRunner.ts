import type {
  SerialQueue,
} from "../serial/SerialQueue";

import type {
  PrintRunnerContext,
} from "./runnerContext";

import type {
  RealSession,
} from "./sessionTypes";

import {
  pauseSessionClock,
} from "./sessionUtils";

import {
  safeStopPrinter,
} from "./safeStop";

export class RealPrintRunner {
  constructor(
    private readonly queue:
      SerialQueue,

    private readonly context:
      PrintRunnerContext,
  ) {}

  async run(
    session: RealSession,
  ): Promise<void> {
    const commandSource =
      session.commandSource;

    if (!commandSource) {
      this.context.error(
        new Error(
          "The print command source is unavailable.",
        ),
      );
      this.context.stop(
        session,
        false,
      );
      return;
    }

    let index = 0;

    try {
      for await (
        const command of
        commandSource
      ) {
        if (
          !this.context.isCurrent(
            session,
          ) ||
          session.stopRequested
        ) {
          break;
        }

        await this.waitWhilePaused(
          session,
        );

        if (
          !this.context.isCurrent(
            session,
          ) ||
          session.stopRequested
        ) {
          break;
        }

        await this.queue.queue(
          command,
        );

        if (
          !this.context.isCurrent(
            session,
          )
        ) {
          return;
        }

        session.currentLine =
          index + 1;

        session.currentLayer =
          session
            .commandLayers[index];

        this.context.emitProgress(
          session,
        );
        index++;
      }

      if (
        !this.context.isCurrent(
          session,
        )
      ) {
        return;
      }

      if (session.stopRequested) {
        await this.stopSafely(
          session,
        );
        return;
      }

      this.context.finish(
        session,
      );
    } catch (error) {
      if (
        !this.context.isCurrent(
          session,
        )
      ) {
        return;
      }

      await this.stopSafely(
        session,
        session.stopRequested
          ? undefined
          : error,
      );
    } finally {
      await commandSource.close();
    }
  }

  private async stopSafely(
    session: RealSession,
    printError?: unknown,
  ): Promise<void> {
    let reportedError =
      printError;

    try {
      await safeStopPrinter(
        this.queue,
      );
    } catch (stopError) {
      reportedError =
        reportedError === undefined
          ? stopError
          : new AggregateError(
              [
                reportedError,
                stopError,
              ],
              "The print failed and the printer could not be stopped cleanly.",
            );
    }

    if (
      !this.context.isCurrent(
        session,
      )
    ) {
      return;
    }

    if (
      reportedError !== undefined
    ) {
      this.context.error(
        reportedError,
      );
    }

    this.context.stop(
      session,
      false,
    );
  }

  private async waitWhilePaused(
    session: RealSession,
  ): Promise<void> {
    if (
      !session.pauseRequested
    ) {
      return;
    }

    pauseSessionClock(
      session,
    );

    this.context.setStatus(
      session,
      "paused",
    );

    await new Promise<void>(
      (resolve) => {
        session.resumeResolver =
          resolve;
      },
    );

    session.resumeResolver = null;

    if (
      !this.context.isCurrent(
        session,
      ) ||
      session.stopRequested
    ) {
      return;
    }

    session.runStartedAtMs =
      performance.now();

    this.context.setStatus(
      session,
      "printing",
    );
  }
}
