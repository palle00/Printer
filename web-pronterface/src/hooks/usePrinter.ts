import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { createTestPrintPayload } from "../print/createTestPrintPayload";
import {
  appendTerminalLine,
  reducePrinterEvent,
} from "../state/printerState";
import type { ParsedGcode } from "../types/gcode";
import {
  initialPrinterState,
  type PrinterState,
} from "../types/printer";

export function usePrinter() {
  const testPrintBuildActive = useRef(false);
  const [state, setState] = useState<PrinterState>(
    initialPrinterState,
  );

  const appendTerminal = useCallback((text: string) => {
    setState((previous) => appendTerminalLine(previous, text));
  }, []);

  const reportError = useCallback(
    (error: unknown) => {
      const message =
        error instanceof Error ? error.message : String(error);

      setState((previous) => ({
        ...previous,
        error: message,
      }));
      appendTerminal(`>> ${message}`);
    },
    [appendTerminal],
  );

  useEffect(
    () =>
      window.desktop.printer.onEvent((event) => {
        setState((previous) => reducePrinterEvent(previous, event));
      }),
    [],
  );

  const connect = useCallback(async () => {
    try {
      const connection =
        await window.desktop.printer.connect(115200);

      if (!connection) {
        appendTerminal(">> Port selection cancelled.");
        return;
      }

      appendTerminal(
        `>> Connected to ${connection.path} at ${connection.baudRate} baud.`,
      );
    } catch (error) {
      reportError(error);
    }
  }, [appendTerminal, reportError]);

  const disconnect = useCallback(() => {
    void window.desktop.printer.disconnect().catch(reportError);
  }, [reportError]);

  const sendGcode = useCallback(
    (gcode: string) => {
      const cleaned = gcode.trim();

      if (cleaned) {
        void window.desktop.printer
          .sendGcode(cleaned)
          .catch(reportError);
      }
    },
    [reportError],
  );

  const startPrint = useCallback(
    (gcode: ParsedGcode) => {
      void window.desktop.printer
        .startPrint({
          fileName: gcode.fileName,
          lines: gcode.lines,
          totalLayers: gcode.totalLayers,
        })
        .catch(reportError);
    },
    [reportError],
  );

  const startTestPrint = useCallback(
    (gcode: ParsedGcode) => {
      if (testPrintBuildActive.current) {
        return;
      }

      testPrintBuildActive.current = true;

      const payload = createTestPrintPayload(gcode);

      void window.desktop.printer
        .startTestPrint(payload)
        .catch(reportError)
        .finally(() => {
          testPrintBuildActive.current = false;
        });
    },
    [reportError],
  );

  const pausePrint = useCallback(() => {
    void window.desktop.printer.pausePrint().catch(reportError);
  }, [reportError]);

  const resumePrint = useCallback(() => {
    void window.desktop.printer.resumePrint().catch(reportError);
  }, [reportError]);

  const stopPrint = useCallback(() => {
    void window.desktop.printer.stopPrint().catch(reportError);
  }, [reportError]);

  const resetPrint = useCallback(() => {
    void window.desktop.printer.resetPrint().catch(reportError);
  }, [reportError]);

  const clearTerminal = useCallback(() => {
    setState((previous) => ({
      ...previous,
      terminal: [],
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((previous) => ({
      ...previous,
      error: null,
    }));
  }, []);

  return {
    ...state,
    isTestMode: state.mode === "test",
    connect,
    disconnect,
    sendGcode,
    startPrint,
    startTestPrint,
    pausePrint,
    resumePrint,
    stopPrint,
    resetPrint,
    clearTerminal,
    clearError,
  };
}
