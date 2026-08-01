import type {
  PrinterEvents,
} from "../core/PrinterEvents";

import {
  stripGcodeLine,
} from "../../gcode/commandLine";

import type {
  SerialTransport,
} from "./SerialTransport";
import { frameMarlinCommand } from "./marlinProtocol";

const COMMAND_TIMEOUT_MS =
  15 * 60 * 1000;

interface PendingAcknowledgement {
  resolve: () => void;

  reject: (
    error: Error,
  ) => void;

  timeout:
    ReturnType<typeof setTimeout>;
  command: string;
  transmitted: string;
  lineNumber: number | null;
  resendCount: number;
}

type AcknowledgedCommandHandler = (
  command: string,
) => void;

export class SerialQueue {
  private marlinChecksumsEnabled = false;
  private nextLineNumber = 1;
  private readonly replayBuffer = new Map<number, string>();
  private pending:
    PendingAcknowledgement | null =
      null;

  private chain:
    Promise<void> =
      Promise.resolve();

  private generation = 0;

  constructor(
    private readonly connection:
      SerialTransport,

    private readonly events:
      PrinterEvents,

    private readonly onAcknowledgedCommand:
      AcknowledgedCommandHandler,
  ) {}

  get isWaiting(): boolean {
    return this.pending !== null;
  }

  queue(
    command: string,
    timeoutMs =
      COMMAND_TIMEOUT_MS,
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
          timeoutMs,
        );

        this.onAcknowledgedCommand(
          normalized,
        );
      });

    this.chain = task.catch(
      () => undefined,
    );

    return task;
  }

  async sendMany(
    gcode: string,
  ): Promise<void> {
    const lines =
      gcode.split(/\r?\n/);

    for (const line of lines) {
      const command =
        stripGcodeLine(line);

      if (command) {
        await this.queue(command);
      }
    }
  }

  async enableMarlinChecksums(): Promise<void> {
    if (this.marlinChecksumsEnabled) return;
    await this.queue("M110 N0", 5_000);
    this.nextLineNumber = 1;
    this.replayBuffer.clear();
    this.marlinChecksumsEnabled = true;
  }

  disableMarlinChecksums(): void {
    this.marlinChecksumsEnabled = false;
    this.nextLineNumber = 1;
    this.replayBuffer.clear();
  }

  async resend(lineNumber: number): Promise<boolean> {
    const pending = this.pending;
    if (!pending || pending.lineNumber !== lineNumber || pending.resendCount >= 3) {
      return false;
    }
    const transmitted = this.replayBuffer.get(lineNumber);
    if (!transmitted) return false;
    pending.resendCount += 1;
    this.events.terminalOut(`> [resend ${lineNumber}] ${pending.command}`);
    await this.connection.write(transmitted);
    return true;
  }

  async sendImmediate(command: string): Promise<void> {
    const normalized = command.trim();
    if (!normalized) return;
    this.events.terminalOut(`> [immediate] ${normalized}`);
    await this.connection.write(normalized);
  }

  resolveAcknowledgement(): void {
    const pending = this.pending;

    if (!pending) {
      return;
    }

    this.pending = null;

    clearTimeout(
      pending.timeout,
    );

    pending.resolve();
  }

  rejectAcknowledgement(
    error: Error,
  ): void {
    const pending = this.pending;

    if (!pending) {
      return;
    }

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
    timeoutMs: number,
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
        "Another printer command is awaiting acknowledgement.",
      );
    }

    const lineNumber = this.marlinChecksumsEnabled ? this.nextLineNumber++ : null;
    const transmitted = lineNumber === null ? command : frameMarlinCommand(lineNumber, command);
    if (lineNumber !== null) {
      this.replayBuffer.set(lineNumber, transmitted);
      while (this.replayBuffer.size > 32) {
        const oldest = this.replayBuffer.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        this.replayBuffer.delete(oldest);
      }
    }

    this.events.terminalOut(`> ${command}`);

    await new Promise<void>(
      (resolve, reject) => {
        const pending:
          PendingAcknowledgement = {
          resolve,

          reject,

          timeout: setTimeout(
            () => {
              if (
                this.pending ===
                pending
              ) {
                this.pending = null;
              }

              reject(
                new Error(
                  `Printer did not acknowledge: ${command}`,
                ),
              );
            },
            timeoutMs,
          ),
          command,
          transmitted,
          lineNumber,
          resendCount: 0,
        };

        this.pending = pending;

        void this.connection
          .write(transmitted)
          .catch(
            (error: unknown) => {
              if (
                this.pending ===
                pending
              ) {
                this.pending = null;
              }

              clearTimeout(
                pending.timeout,
              );

              reject(
                error instanceof Error
                  ? error
                  : new Error(
                      String(error),
                    ),
              );
            },
          );
      },
    );
  }
}
