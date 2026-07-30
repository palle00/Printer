import type {
  TestPrintPath,
} from "../../types/printer-ipc";

import type {
  PrintMode,
  PrinterStatus,
} from "../../types/printer";

import type {
  PreparedCommands,
} from "../gcode/prepareCommands";

export interface BaseSession {
  mode: Exclude<
    PrintMode,
    null
  >;

  status: PrinterStatus;

  fileName: string;

  totalLines: number;
  totalLayers: number;

  currentLine: number;
  currentLayer: number;

  elapsedBeforeRunMs: number;
  runStartedAtMs: number;

  pauseRequested: boolean;
  stopRequested: boolean;

  resumeResolver:
    (() => void) | null;
}

export interface RealSession
  extends BaseSession {
  mode: "real";

  commands:
    PreparedCommands;
}

export interface TestSession
  extends BaseSession {
  mode: "test";

  path:
    TestPrintPath;

  durationMs: number;

  timer:
    ReturnType<
      typeof setTimeout
    > | null;
}

export type PrintSession =
  | RealSession
  | TestSession;
