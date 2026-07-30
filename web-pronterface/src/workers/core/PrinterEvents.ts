import type {
  PrintMode,
  PrintCompletionMetrics,
  PrintProgress,
  PrinterPosition,
  PrinterStatus,
  PrinterEvent,
} from "../../types/printer";

interface PrinterEventTarget {
  postMessage(event: PrinterEvent): void;
}

export type IdlePrinterStatus =
  | "idle"
  | "disconnected";

interface TemperatureEventData {
  timestamp: number;

  hotend?: number;
  targetHotend?: number;

  bed?: number;
  targetBed?: number;
}

export class PrinterEvents {
  constructor(
    private readonly target:
      PrinterEventTarget,
  ) {}

  post(
    event: PrinterEvent,
  ): void {
    this.target.postMessage(event);
  }

  error(error: unknown): void {
    this.post({
      type: "ERROR",

      message:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }

  connected(): void {
    this.post({
      type: "CONNECTED",
    });
  }

  disconnected(
    unexpected = false,
  ): void {
    this.post({
      type: "DISCONNECTED",
      unexpected,
    });
  }

  status(
    status: PrinterStatus,
  ): void {
    this.post({
      type: "STATUS",
      status,
    });
  }

  terminalIn(text: string): void {
    this.post({
      type: "TERMINAL_IN",
      text,
    });
  }

  terminalOut(text: string): void {
    this.post({
      type: "TERMINAL_OUT",
      text,
    });
  }

  temperature(
    data: TemperatureEventData,
  ): void {
    this.post({
      type: "TEMPERATURE",
      ...data,
    });
  }

  position(
    position: PrinterPosition,
  ): void {
    this.post({
      type: "POSITION",

      position: {
        ...position,
      },
    });
  }

  progress(
    progress: PrintProgress,
  ): void {
    this.post({
      type: "PROGRESS",
      progress,
    });
  }

  printStarted(
    mode: Exclude<PrintMode, null>,
    fileName: string,
    totalLines: number,
    totalLayers: number,
  ): void {
    this.post({
      type: "PRINT_STARTED",

      mode,
      fileName,
      totalLines,
      totalLayers,
    });
  }

  printFinished(
    mode: Exclude<PrintMode, null>,
    elapsedSeconds: number,
    metrics:
      PrintCompletionMetrics,
  ): void {
    this.post({
      type: "PRINT_FINISHED",

      mode,
      elapsedSeconds,
      metrics,
    });
  }

  printStopped(
    mode: PrintMode,
    status: IdlePrinterStatus,
    clearSession: boolean,
  ): void {
    this.post({
      type: "PRINT_STOPPED",

      mode,
      status,
      clearSession,
    });
  }

  printReset(
    status: IdlePrinterStatus,
  ): void {
    this.post({
      type: "PRINT_RESET",
      status,
    });
  }
}
