import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  ParsedGcode,
} from "../types/gcode";

import {
  initialPrintProgress,
  initialPrinterPosition,
  initialPrinterState,
  type PrinterEvent,
  type PrinterState,
} from "../types/printer";

const MAX_TERMINAL_LINES = 300;
const MAX_TEMPERATURE_SAMPLES = 60;

export function usePrinter() {
  const [state, setState] =
    useState<PrinterState>(
      initialPrinterState,
    );

  const appendTerminal =
    useCallback(
      (text: string) => {
        setState((previous) => ({
          ...previous,

          terminal: [
            ...previous.terminal.slice(
              -(
                MAX_TERMINAL_LINES -
                1
              ),
            ),

            text,
          ],
        }));
      },
      [],
    );

  const reportError =
    useCallback(
      (error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        setState((previous) => ({
          ...previous,
          error: message,
        }));

        appendTerminal(
          `>> ${message}`,
        );
      },
      [appendTerminal],
    );

  useEffect(() => {
    const handleEvent = (
      message: PrinterEvent,
    ): void => {
      switch (message.type) {
        case "CONNECTED": {
          setState((previous) => ({
            ...previous,

            connected: true,
            status: "idle",
            mode: null,
            error: null,
          }));

          break;
        }

        case "DISCONNECTED": {
          setState((previous) => ({
            ...previous,

            connected: false,
            status: "disconnected",
            mode: null,
          }));

          break;
        }

        case "STATUS": {
          setState((previous) => ({
            ...previous,

            status:
              message.status,
          }));

          break;
        }

        case "PRINT_STARTED": {
          setState((previous) => ({
            ...previous,

            mode:
              message.mode,

            status: "printing",

            progress: {
              ...initialPrintProgress,

              fileName:
                message.fileName,

              totalLines:
                message.totalLines,

              currentLayer:
                message.totalLayers >
                  0
                  ? 1
                  : 0,

              totalLayers:
                message.totalLayers,
            },
          }));

          break;
        }

        case "PRINT_FINISHED": {
          setState((previous) => ({
            ...previous,

            mode:
              message.mode,

            status: "idle",

            progress: {
              ...previous.progress,

              currentLine:
                previous.progress
                  .totalLines,

              currentLayer:
                previous.progress
                  .totalLayers,

              percent: 100,

              elapsedSeconds:
                message.elapsedSeconds,

              etaSeconds: 0,
            },
          }));

          break;
        }

        case "PRINT_STOPPED": {
          setState((previous) => {
            if (
              message.clearSession
            ) {
              return {
                ...previous,

                mode: null,

                status:
                  message.status,

                progress: {
                  ...initialPrintProgress,
                },

                position: {
                  ...initialPrinterPosition,
                },
              };
            }

            return {
              ...previous,

              mode:
                message.mode,

              status:
                message.status,
            };
          });

          break;
        }

        case "PRINT_RESET": {
          setState((previous) => ({
            ...previous,

            mode: null,

            status:
              message.status,

            progress: {
              ...initialPrintProgress,
            },

            position: {
              ...initialPrinterPosition,
            },
          }));

          break;
        }

        case "PROGRESS": {
          setState((previous) => ({
            ...previous,

            progress:
              message.progress,
          }));

          break;
        }

        case "POSITION": {
          setState((previous) => ({
            ...previous,

            position:
              message.position,
          }));

          break;
        }

        case "TEMPERATURE": {
          setState((previous) => {
            const hotend =
              message.hotend ??
              previous.hotend;

            const targetHotend =
              message.targetHotend ??
              previous.targetHotend;

            const bed =
              message.bed ??
              previous.bed;

            const targetBed =
              message.targetBed ??
              previous.targetBed;

            return {
              ...previous,

              hotend,
              targetHotend,

              bed,
              targetBed,

              temperatureHistory: [
                ...previous
                  .temperatureHistory
                  .slice(
                    -(
                      MAX_TEMPERATURE_SAMPLES -
                      1
                    ),
                  ),

                {
                  timestamp:
                    message.timestamp,

                  hotend,
                  targetHotend,

                  bed,
                  targetBed,
                },
              ],
            };
          });

          break;
        }

        case "TERMINAL_IN":
        case "TERMINAL_OUT": {
          appendTerminal(
            message.text,
          );

          break;
        }

        case "ERROR": {
          setState((previous) => ({
            ...previous,

            error:
              message.message,
          }));

          break;
        }
      }
    };

    return window.desktop
      .printer
      .onEvent(handleEvent);
  }, [appendTerminal]);

  const connect =
    useCallback(async () => {
      try {
        const connection =
          await window.desktop
            .printer
            .connect(115200);

        if (!connection) {
          appendTerminal(
            ">> Port selection cancelled.",
          );

          return;
        }

        appendTerminal(
          `>> Connected to ${connection.path} at ${connection.baudRate} baud.`,
        );
      } catch (error) {
        reportError(error);
      }
    }, [
      appendTerminal,
      reportError,
    ]);

  const disconnect =
    useCallback(() => {
      void window.desktop
        .printer
        .disconnect()
        .catch(reportError);
    }, [reportError]);

  const sendGcode =
    useCallback(
      (gcode: string) => {
        const cleaned =
          gcode.trim();

        if (!cleaned) {
          return;
        }

        void window.desktop
          .printer
          .sendGcode(cleaned)
          .catch(reportError);
      },
      [reportError],
    );

  const startPrint =
    useCallback(
      (gcode: ParsedGcode) => {
        void window.desktop.printer.startPrint({
          fileName: gcode.fileName,
          lines: gcode.lines,
          totalLayers: gcode.totalLayers,
        });
      },
      [reportError],
    );

  const startTestPrint =
    useCallback(
      (gcode: ParsedGcode) => {
        void window.desktop
          .printer
          .startTestPrint(
            gcode,
          )
          .catch(reportError);
      },
      [reportError],
    );

  const pausePrint =
    useCallback(() => {
      void window.desktop
        .printer
        .pausePrint()
        .catch(reportError);
    }, [reportError]);

  const resumePrint =
    useCallback(() => {
      void window.desktop
        .printer
        .resumePrint()
        .catch(reportError);
    }, [reportError]);

  const stopPrint =
    useCallback(() => {
      void window.desktop
        .printer
        .stopPrint()
        .catch(reportError);
    }, [reportError]);

  const resetPrint =
    useCallback(() => {
      void window.desktop
        .printer
        .resetPrint()
        .catch(reportError);
    }, [reportError]);

  const clearTerminal =
    useCallback(() => {
      setState((previous) => ({
        ...previous,
        terminal: [],
      }));
    }, []);

  const clearError =
    useCallback(() => {
      setState((previous) => ({
        ...previous,
        error: null,
      }));
    }, []);

  return {
    ...state,

    isTestMode:
      state.mode === "test",

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

export type PrinterController =
  ReturnType<typeof usePrinter>;