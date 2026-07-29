import type {
  WorkerEvents,
} from "../core/WorkerEvents";

import {
  stripGcodeLine,
} from "../gcode/prepareCommands";

import type {
  SerialConnection,
} from "./SerialConnection";

const COMMAND_TIMEOUT_MS =
  15 * 60 * 1000;

interface PendingAcknowledgement {
  resolve: () => void;

  reject: (
    error: Error,
  ) => void;

  timeout:
    ReturnType<typeof setTimeout>;
}

type AcknowledgedCommandHandler = (
  command: string,
) => void;

export class SerialQueue {
  private pending:
    PendingAcknowledgement | null =
    null;

  private chain:
    Promise<void> =
    Promise.resolve();

  private generation = 0;

  constructor(
    private readonly connection:
      SerialConnection,

    private readonly events:
      WorkerEvents,

    private readonly onAcknowledgedCommand:
      AcknowledgedCommandHandler,
  ) {}

  get isWaiting(): boolean {
    return this.pending !== null;
  }

  queue(
    command: string,
  ): Promise<void> {
    const normalized =
      command.trim();

    if (!normalized) {
      return Promise.resolve();
    }

    const generation =
      this.generation;

    const task =
      this.chain.then(async () => {
        if (
          generation !==
          this.generation
        ) {
          throw new Error(
            "Serial command queue was reset.",
          );
        }

        await this.writeAndWaitForOk(
          normalized,
        );

        this.onAcknowledgedCommand(
          normalized,
        );
      });

    this.chain =
      task.catch(
        () => undefined,
      );

    return task;
  }

  async sendMany(
    gcode: string,
  ): Promise<void> {
    const commands = gcode
      .split(/\r?\n/)
      .map((line) =>
        stripGcodeLine(line),
      )
      .filter(
        (command) =>
          command.length > 0,
      );

    for (const command of commands) {
      await this.queue(command);
    }
  }

  resolveAcknowledgement(): void {
    if (!this.pending) {
      return;
    }

    const pending = this.pending;

    this.pending = null;

    clearTimeout(
      pending.timeout,
    );

    pending.resolve();
  }

  rejectAcknowledgement(
    error: Error,
  ): void {
    if (!this.pending) {
      return;
    }

    const pending = this.pending;

    this.pending = null;

    clearTimeout(
      pending.timeout,
    );

    pending.reject(error);
  }

  reset(
    error = new Error(
      "Serial command queue reset.",
    ),
  ): void {
    this.generation++;

    this.rejectAcknowledgement(
      error,
    );

    this.chain =
      Promise.resolve();
  }

  private async writeAndWaitForOk(
    command: string,
  ): Promise<void> {
    if (
      !this.connection.connected
    ) {
      throw new Error(
        "Printer is not connected.",
      );
    }

    if (this.pending) {
      throw new Error(
        "Another printer command is still waiting for acknowledgement.",
      );
    }

    this.events.terminalOut(
      `> ${command}`,
    );

    await new Promise<void>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => {
            if (this.pending) {
              this.pending = null;
            }

            reject(
              new Error(
                `Printer did not acknowledge: ${command}`,
              ),
            );
          },

          COMMAND_TIMEOUT_MS,
        );

        this.pending = {
          resolve,
          reject,
          timeout,
        };

        void this.connection
          .write(command)
          .catch((error: unknown) => {
            clearTimeout(timeout);

            this.pending = null;

            reject(
              error instanceof Error
                ? error
                : new Error(
                    String(error),
                  ),
            );
          });
      },
    );
  }
}