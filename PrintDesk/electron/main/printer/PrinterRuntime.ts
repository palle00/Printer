import type {
    NativeSerialPortInfo,
    TestPrintPayload,
} from "../../../src/types/printer-ipc";
import type { ObjectCancellationProtocol } from "../../../src/types/gcode";
import { detectPrinterFromM115, type DetectedPrinter } from "../../../src/printer/firmwareDetection";

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
import type {
    RealPrintJob,
} from "../../../src/workers/print/realPrintJob";

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

const POSITION_QUERY_TIMEOUT_MS =
    5_000;

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
    private identificationLines: string[] | null = null;

    get isPrintActive():
        boolean {
        return this.prints
            .isActive;
    }

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
        usbSerialNumber: string | null = null,
    ): Promise<DetectedPrinter | null> {
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

        const detectedPrinter = await this.detectPrinter(usbSerialNumber);

        /*
         * Request the current position after
         * connecting. M114 is optional.
         */
        void this.serialQueue
            .queue(
                "M114",
                POSITION_QUERY_TIMEOUT_MS,
            )
            .catch(() => undefined);
        return detectedPrinter;
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

        this.events.disconnected(
            false,
        );
    }

    async sendGcode(
        gcode: string,
    ): Promise<void> {
        if (this.prints.isActive) {
            throw new Error(
                "Manual G-code cannot be sent while a print is active.",
            );
        }

        try {
            await this.serialQueue
                .sendMany(gcode);
        } catch (error) {
            this.events.error(error);
            throw error;
        }
    }

    startPrint(
        print: RealPrintJob,
    ): void {
        if (this.disposed) {
            throw new Error(
                "Printer runtime has been disposed.",
            );
        }

        if (
            !this.connection.connected
        ) {
            throw new Error(
                "Connect the printer before starting a real print.",
            );
        }

        if (this.prints.isActive) {
            throw new Error(
                "A print is already active.",
            );
        }

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

    async cancelObject(protocol: ObjectCancellationProtocol, objectId: string): Promise<void> {
        if (!this.prints.isActive) throw new Error("Object cancellation requires an active print.");
        const command = protocol === "marlin-m486" ? `M486 P${objectId}` : `EXCLUDE_OBJECT NAME=${objectId}`;
        await this.serialQueue.queue(command);
        this.options.emit({ type: "OBJECT_CANCELLED", objectId });
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

                    this.identificationLines?.push(line);

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
                        .disconnected(
                            true,
                        );
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

    private async detectPrinter(usbSerialNumber: string | null): Promise<DetectedPrinter | null> {
        const lines: string[] = [];
        this.identificationLines = lines;
        try {
            await this.serialQueue.queue("M115", 5_000);
            return detectPrinterFromM115(lines, usbSerialNumber);
        } catch {
            return null;
        } finally {
            if (this.identificationLines === lines) this.identificationLines = null;
        }
    }
}
