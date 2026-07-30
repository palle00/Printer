import type {
    NativeSerialPortInfo,
    RealPrintPayload,
    TestPrintPayload,
} from "../../../src/types/printer-ipc";

import type {
    PrinterEvent,
    PrinterStatus,
} from "../../../src/types/printer";

import {
    PrinterEvents,
} from "../../../src/workers/core/PrinterEvents";

import {
    PositionTracker,
} from "../../../src/workers/gcode/PositionTracker";

import {
    PrintSessionManager,
} from "../../../src/workers/print/PrintSessionManager";

import {
    parsePrinterResponse,
} from "../../../src/workers/serial/responseParser";

import {
    SerialQueue,
} from "../../../src/workers/serial/SerialQueue";

import {
    TemperaturePoller,
} from "../../../src/workers/serial/TemperaturePoller";

import {
    NativeSerialTransport,
} from "./NativeSerialTransport";

interface PrinterRuntimeOptions {
    emit(
        event: PrinterEvent,
    ): void;

    setPrintingActive(
        active: boolean,
    ): void;
}

function statusRequiresAwakeComputer(
    status: PrinterStatus,
): boolean {
    return (
        status === "printing" ||
        status === "pausing" ||
        status === "paused" ||
        status === "stopping"
    );
}

export class PrinterRuntime {
    private readonly events:
        PrinterEvents;

    private readonly connection:
        NativeSerialTransport;

    private readonly positionTracker:
        PositionTracker;

    private readonly serialQueue:
        SerialQueue;

    private readonly prints:
        PrintSessionManager;

    private readonly temperaturePoller:
        TemperaturePoller;

    private disposed = false;

    constructor(
        private readonly options:
            PrinterRuntimeOptions,
    ) {
        this.events =
            new PrinterEvents({
                postMessage: (
                    event: PrinterEvent,
                ) => {
                    this.handlePowerState(
                        event,
                    );

                    this.options.emit(
                        event,
                    );
                },
            });

        this.connection =
            new NativeSerialTransport();

        this.positionTracker =
            new PositionTracker(
                this.events,
            );

        this.serialQueue =
            new SerialQueue(
                this.connection,

                this.events,

                (command) => {
                    this.positionTracker
                        .trackAcknowledgedCommand(
                            command,
                        );
                },
            );

        this.prints =
            new PrintSessionManager({
                events:
                    this.events,

                serialQueue:
                    this.serialQueue,

                positionTracker:
                    this.positionTracker,

                isConnected: () =>
                    this.connection
                        .connected,
            });

        this.temperaturePoller =
            new TemperaturePoller({
                connection:
                    this.connection,

                queue:
                    this.serialQueue,

                isPrintActive: () =>
                    this.prints.isActive,
            });

        this.configureTransport();
    }

    async listPorts():
        Promise<NativeSerialPortInfo[]> {
        return NativeSerialTransport
            .listPorts();
    }

    async connect(
        path: string,
        baudRate: number,
    ): Promise<void> {
        if (this.disposed) {
            throw new Error(
                "Printer runtime has been disposed.",
            );
        }

        if (
            this.connection.connected
        ) {
            throw new Error(
                "A printer is already connected.",
            );
        }

        await this.connection.connect({
            path,
            baudRate,
        });

        this.events.connected();

        /*
         * Request the current position after
         * connecting. M114 is optional.
         */
        await this.serialQueue
            .queue("M114")
            .catch(() => undefined);
    }

    async disconnect():
        Promise<void> {
        this.prints.handleDisconnect();

        this.serialQueue.reset(
            new Error(
                "Printer disconnected.",
            ),
        );

        await this.connection
            .disconnect();

        this.events.disconnected();
    }

    async sendGcode(
        gcode: string,
    ): Promise<void> {
        try {
            await this.serialQueue
                .sendMany(gcode);
        } catch (error) {
            this.events.error(error);
            throw error;
        }
    }

    startPrint(
        print: RealPrintPayload,
    ): void {
        this.prints.startReal(print);
    }

    startTestPrint(
        print: TestPrintPayload,
    ): void {
        this.prints.startTest({
            fileName:
                print.fileName,

            printableLines:
                print.printableLines,

            totalLayers:
                print.totalLayers,

            path:
                print.path,
        });
    }

    pausePrint(): void {
        this.prints.pause();
    }

    resumePrint(): void {
        this.prints.resume();
    }

    stopPrint(): void {
        this.prints.stop();
    }

    resetPrint(): void {
        this.prints.reset();
    }

    async dispose():
        Promise<void> {
        if (this.disposed) {
            return;
        }

        this.disposed = true;

        this.temperaturePoller
            .dispose();

        this.prints.handleDisconnect();

        this.serialQueue.reset(
            new Error(
                "Printer runtime disposed.",
            ),
        );

        await this.connection
            .disconnect()
            .catch(() => undefined);

        this.options
            .setPrintingActive(
                false,
            );
    }

    private configureTransport():
        void {
        this.connection
            .setLineHandler(
                (rawLine) => {
                    const line =
                        rawLine.trim();

                    if (!line) {
                        return;
                    }

                    this.events.terminalIn(
                        line,
                    );

                    const response =
                        parsePrinterResponse(
                            line,

                            this.positionTracker
                                .current.e,
                        );

                    if (
                        response.temperature
                    ) {
                        this.events.temperature(
                            response.temperature,
                        );
                    }

                    if (
                        response.position
                    ) {
                        this.positionTracker.set(
                            response.position,
                        );
                    }

                    if (response.error) {
                        this.serialQueue
                            .rejectAcknowledgement(
                                response.error,
                            );
                    }

                    if (
                        response.acknowledge
                    ) {
                        this.serialQueue
                            .resolveAcknowledgement();
                    }
                },
            );

        this.connection
            .setErrorHandler(
                (error) => {
                    this.events.error(
                        error,
                    );
                },
            );

        this.connection
            .setDisconnectHandler(
                (error) => {
                    this.prints
                        .handleDisconnect();

                    this.serialQueue.reset(
                        error ??
                        new Error(
                            "Printer disconnected.",
                        ),
                    );

                    if (error) {
                        this.events.error(
                            error,
                        );
                    }

                    this.events
                        .disconnected();
                },
            );
    }

    private handlePowerState(
        event: PrinterEvent,
    ): void {
        switch (event.type) {
            case "PRINT_STARTED": {
                this.options
                    .setPrintingActive(
                        true,
                    );

                break;
            }

            case "STATUS": {
                this.options
                    .setPrintingActive(
                        statusRequiresAwakeComputer(
                            event.status,
                        ),
                    );

                break;
            }

            case "PRINT_FINISHED":
            case "PRINT_STOPPED":
            case "PRINT_RESET":
            case "DISCONNECTED": {
                this.options
                    .setPrintingActive(
                        false,
                    );

                break;
            }
        }
    }
}
