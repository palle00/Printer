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
    try {
      for (
        let index = 0;
        index <
        session.commands.length;
        index++
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

        const command =
          session.commands[index];

        await this.queue.queue(
          command.text,
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
          command.layer;

        this.context.emitProgress(
          session,
        );
      }

      if (
        !this.context.isCurrent(
          session,
        )
      ) {
        return;
      }

      if (session.stopRequested) {
        await safeStopPrinter(
          this.queue,
        );

        if (
          this.context.isCurrent(
            session,
          )
        ) {
          this.context.stop(
            session,
            false,
          );
        }

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

      this.context.error(error);

      this.context.stop(
        session,
        false,
      );
    }
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