import type {
  GcodeSegment,
} from "../../types/gcode";

import type {
  PrintMode,
  PrinterStatus,
} from "../../types/printer";

import type {
  PreparedCommand,
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
    PreparedCommand[];
}

export interface TestSession
  extends BaseSession {
  mode: "test";

  segments:
    GcodeSegment[];

  durationMs: number;

  timer:
    ReturnType<
      typeof setTimeout
    > | null;
}

export type PrintSession =
  | RealSession
  | TestSession;