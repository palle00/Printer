export type PrinterStatus =
  | "disconnected"
  | "idle"
  | "printing"
  | "pausing"
  | "paused"
  | "stopping";

export type PrintMode =
  | "real"
  | "test"
  | null;

export interface PrinterPosition {
  x: number;
  y: number;
  z: number;
  e: number;
}

export interface PrintProgress {
  fileName: string | null;

  currentLine: number;
  totalLines: number;

  currentLayer: number;
  totalLayers: number;

  percent: number;

  elapsedSeconds: number;
  etaSeconds: number;
}

export interface TemperatureSample {
  timestamp: number;

  hotend: number;
  targetHotend: number;

  bed: number;
  targetBed: number;
}

export interface PrinterState {
  connected: boolean;

  status: PrinterStatus;
  mode: PrintMode;

  hotend: number;
  targetHotend: number;

  bed: number;
  targetBed: number;

  temperatureHistory:
    TemperatureSample[];

  terminal: string[];
  error: string | null;

  progress: PrintProgress;
  position: PrinterPosition;
}

export const initialPrinterPosition:
  PrinterPosition = {
    x: 0,
    y: 0,
    z: 0,
    e: 0,
  };

export const initialPrintProgress:
  PrintProgress = {
    fileName: null,

    currentLine: 0,
    totalLines: 0,

    currentLayer: 0,
    totalLayers: 0,

    percent: 0,

    elapsedSeconds: 0,
    etaSeconds: 0,
  };

export const initialPrinterState:
  PrinterState = {
    connected: false,

    status: "disconnected",
    mode: null,

    hotend: 0,
    targetHotend: 0,

    bed: 0,
    targetBed: 0,

    temperatureHistory: [],

    terminal: [],
    error: null,

    progress: {
      ...initialPrintProgress,
    },

    position: {
      ...initialPrinterPosition,
    },
  };

export type PrinterEvent =
  | {
      type: "CONNECTED";
    }
  | {
      type: "DISCONNECTED";
    }
  | {
      type: "STATUS";
      status: PrinterStatus;
    }
  | {
      type: "PRINT_STARTED";

      mode: Exclude<
        PrintMode,
        null
      >;

      fileName: string;
      totalLines: number;
      totalLayers: number;
    }
  | {
      type: "PRINT_FINISHED";

      mode: Exclude<
        PrintMode,
        null
      >;

      elapsedSeconds: number;
    }
  | {
      type: "PRINT_STOPPED";

      mode: PrintMode;

      status:
        | "idle"
        | "disconnected";

      clearSession: boolean;
    }
  | {
      type: "PRINT_RESET";

      status:
        | "idle"
        | "disconnected";
    }
  | {
      type: "PROGRESS";
      progress: PrintProgress;
    }
  | {
      type: "POSITION";
      position: PrinterPosition;
    }
  | {
      type: "TEMPERATURE";

      timestamp: number;

      hotend?: number;
      targetHotend?: number;

      bed?: number;
      targetBed?: number;
    }
  | {
      type: "TERMINAL_IN";
      text: string;
    }
  | {
      type: "TERMINAL_OUT";
      text: string;
    }
  | {
      type: "ERROR";
      message: string;
    };
