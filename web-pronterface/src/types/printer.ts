export type PrinterStatus =
  | "disconnected"
  | "idle"
  | "printing"
  | "pausing"
  | "paused"
  | "stopping";

export interface TemperatureSample {
  timestamp: number;
  hotend: number;
  targetHotend: number;
  bed: number;
  targetBed: number;
}

export interface PrinterPosition {
  x: number;
  y: number;
  z: number;
  e: number;
}

export interface PrintProgress {
  fileName: string;
  currentLine: number;
  totalLines: number;
  percent: number;
  elapsedSeconds: number;
  etaSeconds: number;
  currentLayer: number;
  totalLayers: number;
}

export interface PrinterState {
  connected: boolean;
  status: PrinterStatus;

  position: PrinterPosition;

  hotend: number;
  targetHotend: number;

  bed: number;
  targetBed: number;

  progress: PrintProgress;
  terminal: string[];
  temperatureHistory: TemperatureSample[];
  error: string | null;
}

export type PrinterWorkerEvent =
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
      type: "TEMPERATURE";
      hotend: number | null;
      targetHotend: number | null;
      bed: number | null;
      targetBed: number | null;
      timestamp: number;
    }
  | {
      type: "PROGRESS";
      fileName: string;
      currentLine: number;
      totalLines: number;
      percent: number;
      elapsedSeconds: number;
      etaSeconds: number;
      currentLayer: number;
      totalLayers: number;
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
      type: "PRINT_STARTED";
      fileName: string;
      totalLines: number;
      totalLayers: number;
    }
  | {
      type: "PRINT_FINISHED";
      fileName: string;
      elapsedSeconds: number;
    }
  | {
      type: "PRINT_PAUSED";
    }
  | {
      type: "PRINT_RESUMED";
    }
  | {
      type: "PRINT_STOPPING";
    }
  | {
      type: "PRINT_STOPPED";
      fileName: string;
    }
  | {
      type: "ERROR";
      message: string;
    }
  | {
    type: "POSITION";
    x: number;
    y: number;
    z: number;
    e: number;
  };

export const initialPrintProgress: PrintProgress = {
  fileName: "",
  currentLine: 0,
  totalLines: 0,
  percent: 0,
  elapsedSeconds: 0,
  etaSeconds: 0,
  currentLayer: 0,
  totalLayers: 0,
};

export const initialPrinterState: PrinterState = {
  connected: false,
  status: "disconnected",

  position: {
    x: 0,
    y: 0,
    z: 0,
    e: 0,
  },

  hotend: 0,
  targetHotend: 0,

  bed: 0,
  targetBed: 0,

  progress: initialPrintProgress,
  terminal: [],
  temperatureHistory: [],
  error: null,
};