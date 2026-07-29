import {
  initialPrintProgress,
  initialPrinterState,
  type PrintProgress,
  type PrinterPosition,
  type PrinterStatus,
} from "../types/printer";

export interface PrintSessionState {
  status: PrinterStatus;
  progress: PrintProgress;
  position: PrinterPosition;
}

export interface StartPrintSession {
  fileName: string;
  totalLines: number;
  totalLayers: number;
  currentLayer?: number;
  etaSeconds?: number;
}

export type PrintSessionAction =
  | {
      type: "SET_STATUS";
      status: PrinterStatus;
    }
  | {
      type: "START";
      payload: StartPrintSession;
    }
  | {
      type: "SET_PROGRESS";
      progress: PrintProgress;
    }
  | {
      type: "PATCH_PROGRESS";
      progress: Partial<PrintProgress>;
    }
  | {
      type: "SET_POSITION";
      position: PrinterPosition;
    }
  | {
      type: "FINISH";
      elapsedSeconds: number;
    }
  | {
      type: "RESET";
      status?: PrinterStatus;
    };

export function createInitialPrintSession(
  status: PrinterStatus = "idle",
): PrintSessionState {
  return {
    status,

    progress: {
      ...initialPrintProgress,
    },

    position: {
      ...initialPrinterState.position,
    },
  };
}

export function printSessionReducer(
  state: PrintSessionState,
  action: PrintSessionAction,
): PrintSessionState {
  switch (action.type) {
    case "SET_STATUS":
      return {
        ...state,
        status: action.status,
      };

    case "START":
      return {
        ...state,

        status: "printing",

        progress: {
          ...initialPrintProgress,

          fileName: action.payload.fileName,

          currentLine: 0,
          totalLines: action.payload.totalLines,

          currentLayer:
            action.payload.currentLayer ?? 1,

          totalLayers:
            action.payload.totalLayers,

          percent: 0,
          elapsedSeconds: 0,

          etaSeconds:
            action.payload.etaSeconds ?? 0,
        },
      };

    case "SET_PROGRESS":
      return {
        ...state,
        progress: action.progress,
      };

    case "PATCH_PROGRESS":
      return {
        ...state,

        progress: {
          ...state.progress,
          ...action.progress,
        },
      };

    case "SET_POSITION":
      return {
        ...state,
        position: action.position,
      };

    case "FINISH":
      return {
        ...state,

        status: "idle",

        progress: {
          ...state.progress,

          currentLine:
            state.progress.totalLines,

          currentLayer:
            state.progress.totalLayers,

          percent: 100,

          elapsedSeconds:
            action.elapsedSeconds,

          etaSeconds: 0,
        },
      };

    case "RESET":
      return createInitialPrintSession(
        action.status ?? "idle",
      );

    default:
      return state;
  }
}

/**
 * Allows PrinterState to use the same session reducer
 * without splitting the rest of its device state.
 */
export function applyPrintSessionAction<
  T extends PrintSessionState,
>(
  state: T,
  action: PrintSessionAction,
): T {
  const sessionState =
    printSessionReducer(state, action);

  return {
    ...state,
    ...sessionState,
  };
}