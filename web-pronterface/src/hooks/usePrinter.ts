import { useCallback, useEffect, useRef, useState } from "react";
import {
    initialPrintProgress,
    initialPrinterState,
    type PrinterState,
    type PrinterWorkerEvent,
} from "../types/printer";

const MAX_TERMINAL_LINES = 300;
const MAX_TEMPERATURE_SAMPLES = 60;

export function usePrinter() {
    const workerRef = useRef<Worker | null>(null);
    const portRef = useRef<SerialPort | null>(null);

    const [state, setState] = useState<PrinterState>(initialPrinterState);

    const appendTerminal = useCallback((text: string) => {
        setState((previous) => ({
            ...previous,
            terminal: [
                ...previous.terminal.slice(-(MAX_TERMINAL_LINES - 1)),
                text,
            ],
        }));
    }, []);

    const closePort = useCallback(async () => {
        const port = portRef.current;
        portRef.current = null;

        if (!port) {
            return;
        }

        try {
            await port.close();
        } catch {
            // The worker may still be releasing its stream locks.
        }
    }, []);

    useEffect(() => {
        const worker = new Worker(
            new URL("../workers/printerWorker.ts", import.meta.url),
            {
                type: "module",
            },
        );

        workerRef.current = worker;

        worker.onmessage = async (
            event: MessageEvent<PrinterWorkerEvent>,
        ) => {
            const message = event.data;

            switch (message.type) {
                case "CONNECTED": {
                    setState((previous) => ({
                        ...previous,
                        connected: true,
                        status: "idle",
                        error: null,
                    }));
                    break;
                }

                case "DISCONNECTED": {
                    setState((previous) => ({
                        ...previous,
                        connected: false,
                        status: "disconnected",
                    }));

                    await closePort();
                    break;
                }

                case "STATUS": {
                    setState((previous) => ({
                        ...previous,
                        status: message.status,
                    }));
                    break;
                }

                case "TEMPERATURE": {
                    setState((previous) => {
                        const hotend =
                            message.hotend ?? previous.hotend;

                        const targetHotend =
                            message.targetHotend ?? previous.targetHotend;

                        const bed =
                            message.bed ?? previous.bed;

                        const targetBed =
                            message.targetBed ?? previous.targetBed;

                        return {
                            ...previous,
                            hotend,
                            targetHotend,
                            bed,
                            targetBed,
                            temperatureHistory: [
                                ...previous.temperatureHistory.slice(
                                    -(MAX_TEMPERATURE_SAMPLES - 1),
                                ),
                                {
                                    timestamp: message.timestamp,
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

                case "PROGRESS": {
                    setState((previous) => ({
                        ...previous,
                        progress: {
                            fileName: message.fileName,
                            currentLine: message.currentLine,
                            totalLines: message.totalLines,
                            percent: message.percent,
                            elapsedSeconds: message.elapsedSeconds,
                            etaSeconds: message.etaSeconds,
                            currentLayer: message.currentLayer,
                            totalLayers: message.totalLayers,
                        },
                    }));
                    break;
                }

                case "PRINT_STARTED": {
                    setState((previous) => ({
                        ...previous,
                        status: "printing",
                        progress: {
                            ...initialPrintProgress,
                            fileName: message.fileName,
                            totalLines: message.totalLines,
                            totalLayers: message.totalLayers,
                        },
                    }));
                    break;
                }

                case "PRINT_FINISHED": {
                    setState((previous) => ({
                        ...previous,
                        status: "idle",
                        progress: {
                            ...previous.progress,
                            percent: 100,
                            currentLine: previous.progress.totalLines,
                            currentLayer: previous.progress.totalLayers,
                            elapsedSeconds: message.elapsedSeconds,
                            etaSeconds: 0,
                        },
                    }));
                    break;
                }

                case "PRINT_PAUSED": {
                    setState((previous) => ({
                        ...previous,
                        status: "paused",
                    }));
                    break;
                }

                case "PRINT_RESUMED": {
                    setState((previous) => ({
                        ...previous,
                        status: "printing",
                    }));
                    break;
                }

                case "PRINT_STOPPING": {
                    setState((previous) => ({
                        ...previous,
                        status: "stopping",
                    }));
                    break;
                }

                case "PRINT_STOPPED": {
                    setState((previous) => ({
                        ...previous,
                        status: "idle",
                    }));
                    break;
                }

                case "TERMINAL_IN": {
                    appendTerminal(message.text);
                    break;
                }

                case "TERMINAL_OUT": {
                    appendTerminal(message.text);
                    break;
                }

                case "ERROR": {
                    setState((previous) => ({
                        ...previous,
                        error: message.message,
                    }));
                    break;
                }
                case "POSITION": {
                    setState((previous) => ({
                        ...previous,
                        position: {
                            x: message.x,
                            y: message.y,
                            z: message.z,
                            e: message.e,
                        },
                    }));
                    break;
                }
            }
        };

        worker.onerror = (event) => {
            setState((previous) => ({
                ...previous,
                error: event.message || "Printer worker failed.",
            }));
        };

        return () => {
            worker.postMessage({
                type: "DISCONNECT",
            });

            worker.terminate();
            workerRef.current = null;

            void closePort();
        };
    }, [appendTerminal, closePort]);

    const connect = useCallback(async () => {
        if (!("serial" in navigator)) {
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
            const port = await navigator.serial.requestPort();

            await port.open({
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: "none",
                flowControl: "none",
            } as any);

            if (!port.readable || !port.writable) {
                await port.close();
                throw new Error(
                    "The serial port did not provide readable and writable streams.",
                );
            }

            portRef.current = port;

            workerRef.current?.postMessage(
                {
                    type: "CONNECT",
                    payload: {
                        readable: port.readable,
                        writable: port.writable,
                    },
                },
                [port.readable, port.writable],
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            setState((previous) => ({
                ...previous,
                connected: false,
                status: "disconnected",
                error: message,
            }));

            appendTerminal(`>> Connection failed: ${message}`);
            await closePort();
        }
    }, [appendTerminal, closePort]);

    const disconnect = useCallback(() => {
        workerRef.current?.postMessage({
            type: "DISCONNECT",
        });
    }, []);

    const sendGcode = useCallback((gcode: string) => {
        const cleaned = gcode.trim();

        if (!cleaned) {
            return;
        }

        workerRef.current?.postMessage({
            type: "SEND_GCODE",
            payload: cleaned,
        });
    }, []);

    const startPrint = useCallback(
        (fileName: string, gcodeText: string) => {
            const lines = gcodeText.split(/\r?\n/);

            workerRef.current?.postMessage({
                type: "PRINT_FILE",
                payload: {
                    fileName,
                    lines,
                },
            });
        },
        [],
    );

    const pausePrint = useCallback(() => {
        workerRef.current?.postMessage({
            type: "PAUSE_PRINT",
        });
    }, []);

    const resumePrint = useCallback(() => {
        workerRef.current?.postMessage({
            type: "RESUME_PRINT",
        });
    }, []);

    const stopPrint = useCallback(() => {
        workerRef.current?.postMessage({
            type: "STOP_PRINT",
        });
    }, []);

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

        connect,
        disconnect,

        sendGcode,

        startPrint,
        pausePrint,
        resumePrint,
        stopPrint,

        clearTerminal,
        clearError,
    };
}