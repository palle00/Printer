import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ParsedGcode,
} from "../types/gcode";

import {
  initialPrintProgress,
  initialPrinterPosition,
  initialPrinterState,
  type PrinterState,
  type PrinterWorkerCommand,
  type PrinterWorkerEvent,
} from "../types/printer";

const MAX_TERMINAL_LINES = 300;
const MAX_TEMPERATURE_SAMPLES = 60;

export function usePrinter() {
  const workerRef =
    useRef<Worker | null>(null);

  const portRef =
    useRef<SerialPort | null>(null);

  const [state, setState] =
    useState<PrinterState>(
      initialPrinterState,
    );

  const postCommand =
    useCallback(
      (
        command:
          PrinterWorkerCommand,

        transfer?: Transferable[],
      ) => {
        workerRef.current?.postMessage(
          command,
          transfer ?? [],
        );
      },
      [],
    );

  const appendTerminal =
    useCallback((text: string) => {
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
    }, []);

  const closePort =
    useCallback(async () => {
      const port = portRef.current;

      portRef.current = null;

      if (!port) {
        return;
      }

      try {
        await port.close();
      } catch {
        // The worker may still be
        // releasing stream locks.
      }
    }, []);

  useEffect(() => {
    const worker = new Worker(
      new URL(
        "../workers/printerWorker.ts",
        import.meta.url,
      ),

      {
        type: "module",
      },
    );

    workerRef.current = worker;

    worker.onmessage = async (
      event:
        MessageEvent<
          PrinterWorkerEvent
        >,
    ) => {
      const message = event.data;

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

            status:
              "disconnected",

            mode: null,
          }));

          await closePort();
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

            mode: message.mode,
            status: "printing",

            progress: {
              ...initialPrintProgress,

              fileName:
                message.fileName,

              currentLine: 0,

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

            mode: message.mode,
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

              mode: message.mode,
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
            status: message.status,

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

    worker.onerror = (event) => {
      setState((previous) => ({
        ...previous,

        error:
          event.message ||
          "Printer worker failed.",
      }));
    };

    return () => {
      worker.postMessage({
        type: "DISCONNECT",
      } satisfies PrinterWorkerCommand);

      worker.terminate();

      workerRef.current = null;

      void closePort();
    };
  }, [
    appendTerminal,
    closePort,
  ]);

  const connect =
    useCallback(async () => {
      if (
        !("serial" in navigator)
      ) {
        setState((previous) => ({
          ...previous,

          error:
            "Web Serial is not supported. Use Chrome, Edge, or Opera.",
        }));

        return;
      }

      if (portRef.current) {
        return;
      }

      try {
        const port =
          await navigator.serial.requestPort();

        await port.open({
          baudRate: 115200,
          dataBits: 8,
          stopBits: 1,
          parity: "none",
          flowControl: "none",
        } as any);

        if (
          !port.readable ||
          !port.writable
        ) {
          await port.close();

          throw new Error(
            "The serial port did not provide readable and writable streams.",
          );
        }

        portRef.current = port;

        const readable =
          port.readable;

        const writable =
          port.writable;

        postCommand(
          {
            type: "CONNECT",

            payload: {
              readable,
              writable,
            },
          },

          [
            readable as unknown as Transferable,
            writable as unknown as Transferable,
          ],
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        setState((previous) => ({
          ...previous,

          connected: false,

          status:
            "disconnected",

          error: message,
        }));

        appendTerminal(
          `>> Connection failed: ${message}`,
        );

        await closePort();
      }
    }, [
      appendTerminal,
      closePort,
      postCommand,
    ]);

  const disconnect =
    useCallback(() => {
      postCommand({
        type: "DISCONNECT",
      });
    }, [postCommand]);

  const sendGcode =
    useCallback(
      (gcode: string) => {
        const cleaned =
          gcode.trim();

        if (!cleaned) {
          return;
        }

        postCommand({
          type: "SEND_GCODE",
          payload: cleaned,
        });
      },
      [postCommand],
    );

  const startPrint =
    useCallback(
      (gcode: ParsedGcode) => {
        postCommand({
          type:
            "START_REAL_PRINT",

          payload: {
            fileName:
              gcode.fileName,

            lines:
              gcode.lines,

            totalLayers:
              gcode.totalLayers,
          },
        });
      },
      [postCommand],
    );

  const startTestPrint =
    useCallback(
      (gcode: ParsedGcode) => {
        postCommand({
          type:
            "START_TEST_PRINT",

          payload: {
            fileName:
              gcode.fileName,

            printableLines:
              gcode.printableLines,

            totalLayers:
              gcode.totalLayers,

            segments:
              gcode.segments,
          },
        });
      },
      [postCommand],
    );

  const pausePrint =
    useCallback(() => {
      postCommand({
        type: "PAUSE_PRINT",
      });
    }, [postCommand]);

  const resumePrint =
    useCallback(() => {
      postCommand({
        type: "RESUME_PRINT",
      });
    }, [postCommand]);

  const stopPrint =
    useCallback(() => {
      postCommand({
        type: "STOP_PRINT",
      });
    }, [postCommand]);

  const resetPrint =
    useCallback(() => {
      postCommand({
        type: "RESET_PRINT",
      });
    }, [postCommand]);

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