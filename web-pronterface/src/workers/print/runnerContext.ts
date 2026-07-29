import type {
  PrinterPosition,
  PrinterStatus,
} from "../../types/printer";

import type {
  PrintSession,
} from "./sessionTypes";

export interface ProgressOptions {
  percentOverride?: number;

  estimatedDurationSeconds?: number;
}

export interface PrintRunnerContext {
  isCurrent(
    session: PrintSession,
  ): boolean;

  setStatus(
    session: PrintSession,
    status: PrinterStatus,
  ): void;

  emitProgress(
    session: PrintSession,
    options?: ProgressOptions,
  ): void;

  emitPosition(
    position: PrinterPosition,
  ): void;

  finish(
    session: PrintSession,
  ): void;

  stop(
    session: PrintSession,
    clearSession: boolean,
  ): void;

  error(error: unknown): void;
}