import {
  initialPrintProgress,
  initialPrinterPosition,
  type PrinterEvent,
  type PrinterState,
} from "../types/printer";

const MAX_TERMINAL_LINES = 300;
const MAX_TEMPERATURE_SAMPLES = 60;

function appendBounded<T>(
  values: readonly T[],
  value: T,
  maximumLength: number,
): T[] {
  return [
    ...values.slice(-(maximumLength - 1)),
    value,
  ];
}

export function appendTerminalLine(
  state: PrinterState,
  text: string,
): PrinterState {
  return appendTerminalLines(
    state,
    [text],
  );
}

export function appendTerminalLines(
  state: PrinterState,
  lines: readonly string[],
): PrinterState {
  if (lines.length === 0) {
    return state;
  }

  return {
    ...state,
    terminal: [
      ...state.terminal,
      ...lines,
    ].slice(-MAX_TERMINAL_LINES),
  };
}

export function reducePrinterEvent(
  state: PrinterState,
  event: PrinterEvent,
): PrinterState {
  switch (event.type) {
    case "CONNECTED":
      return {
        ...state,
        connected: true,
        status: "idle",
        mode: null,
        error: null,
      };

    case "DISCONNECTED":
      return {
        ...state,
        connected: false,
        status: "disconnected",
        mode: null,
      };

    case "STATUS":
      return {
        ...state,
        status: event.status,
      };

    case "PRINT_STARTED":
      return {
        ...state,
        mode: event.mode,
        status: "printing",
        progress: {
          ...initialPrintProgress,
          fileName: event.fileName,
          totalLines: event.totalLines,
          currentLayer: event.totalLayers > 0 ? 1 : 0,
          totalLayers: event.totalLayers,
        },
        cancelledObjectIds: [],
      };

    case "PRINT_FINISHED":
      return {
        ...state,
        mode: event.mode,
        status: "idle",
        progress: {
          ...state.progress,
          currentLine: state.progress.totalLines,
          currentLayer: state.progress.totalLayers,
          percent: 100,
          elapsedSeconds: event.elapsedSeconds,
          etaSeconds: 0,
        },
      };

    case "PRINT_STOPPED":
      if (!event.clearSession) {
        return {
          ...state,
          mode: event.mode,
          status: event.status,
          progress: {
            ...state.progress,
            etaSeconds: 0,
            isHeating: false,
          },
        };
      }

      return {
        ...state,
        mode: null,
        status: event.status,
        progress: { ...initialPrintProgress },
        position: { ...initialPrinterPosition },
      };

    case "PRINT_RESET":
      return {
        ...state,
        mode: null,
        status: event.status,
        progress: { ...initialPrintProgress },
        position: { ...initialPrinterPosition },
      };

    case "PROGRESS":
      return {
        ...state,
        progress: event.progress,
      };

    case "POSITION":
      return {
        ...state,
        position: event.position,
      };

    case "TEMPERATURE": {
      const hotend = event.hotend ?? state.hotend;
      const targetHotend = event.targetHotend ?? state.targetHotend;
      const bed = event.bed ?? state.bed;
      const targetBed = event.targetBed ?? state.targetBed;

      return {
        ...state,
        hotend,
        targetHotend,
        bed,
        targetBed,
        temperatureHistory: appendBounded(
          state.temperatureHistory,
          {
            timestamp: event.timestamp,
            hotend,
            targetHotend,
            bed,
            targetBed,
          },
          MAX_TEMPERATURE_SAMPLES,
        ),
      };
    }

    case "TERMINAL_IN":
    case "TERMINAL_OUT":
      return appendTerminalLine(state, event.text);

    case "ERROR":
      return {
        ...state,
        error: event.message,
      };

    case "OBJECT_CANCELLED":
      return state.cancelledObjectIds.includes(event.objectId) ? state : { ...state, cancelledObjectIds: [...state.cancelledObjectIds, event.objectId] };
  }
}
