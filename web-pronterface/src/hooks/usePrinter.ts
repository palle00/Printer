import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { createTestPrintPayload } from "../print/createTestPrintPayload";
import {
  reducePrinterEvent,
} from "../state/printerState";
import type { ParsedGcode } from "../types/gcode";
import {
  initialPrinterState,
  type PrinterState,
} from "../types/printer";
import {
  getErrorMessage,
} from "../utils/errors";
import {
  useTerminalBatch,
} from "./useTerminalBatch";

export function usePrinter() {
  const testPrintBuildActive = useRef(false);
  const [state, setState] = useState<PrinterState>(
    initialPrinterState,
  );
  const terminal =
    useTerminalBatch(setState);
  const appendTerminal =
    terminal.append;

  const reportError = useCallback(
    (error: unknown) => {
      const message =
        getErrorMessage(error);

      setState((previous) => ({
        ...previous,
        error: message,
      }));
      appendTerminal(`>> ${message}`);
    },
    [appendTerminal],
  );

  useEffect(() => {
    const unsubscribe =
      window.desktop.printer.onEvent(
        (event) => {
          if (
            event.type ===
              "TERMINAL_IN" ||
            event.type ===
              "TERMINAL_OUT"
          ) {
            appendTerminal(event.text);
            return;
          }

          setState((previous) =>
            reducePrinterEvent(
              previous,
              event,
            ),
          );
        },
      );

    return () => {
      unsubscribe();
    };
  }, [appendTerminal]);

  const connect = useCallback(async (path: string) => {
    try {
      const connection =
        await window.desktop.printer.connect(path, 115200);

      appendTerminal(
        `>> Connected to ${connection.path} at ${connection.baudRate} baud.`,
      );
    } catch (error) {
      reportError(error);
      throw error;
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
      if (
        !gcode.filePath ||
        gcode.fileSize === null ||
        !gcode.fileSha256
      ) {
        reportError(
          new Error(
            "Reload the G-code file before starting the print.",
          ),
        );
        return;
      }

      void window.desktop.printer
        .startPrint({
          source: {
            path: gcode.filePath,
            size: gcode.fileSize,
            sha256:
              gcode.fileSha256,
          },
          commandLayers:
            gcode.commandLayers,
          totalLayers: gcode.totalLayers,
          timing: gcode.timing,
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

  const clearTerminal =
    terminal.clear;

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
