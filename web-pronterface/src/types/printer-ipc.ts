import type {
    ParsedGcode,
} from "./gcode";

import type {
    PrinterEvent,
} from "./printer";

export interface RealPrintPayload {
    fileName: string;
    lines: string[];
    totalLayers: number;
}

export const PRINTER_IPC = {
    listPorts:
        "printer:list-ports",

    connect:
        "printer:connect",

    disconnect:
        "printer:disconnect",

    sendGcode:
        "printer:send-gcode",

    startPrint:
        "printer:start-print",

    startTestPrint:
        "printer:start-test-print",

    pausePrint:
        "printer:pause-print",

    resumePrint:
        "printer:resume-print",

    stopPrint:
        "printer:stop-print",

    resetPrint:
        "printer:reset-print",

    event:
        "printer:event",
} as const;

export interface NativeSerialPortInfo {
    path: string;

    manufacturer?: string;
    serialNumber?: string;

    vendorId?: string;
    productId?: string;

    pnpId?: string;
    locationId?: string;
}

export interface PrinterConnectionResult {
    path: string;
    baudRate: number;
}

export interface PrinterApi {
    listPorts():
        Promise<NativeSerialPortInfo[]>;

    /**
     * Opens a native port-selection dialog and
     * connects to the chosen device.
     *
     * Returns null when the dialog is cancelled.
     */
    connect(
        baudRate?: number,
    ): Promise<
        PrinterConnectionResult | null
    >;

    disconnect(): Promise<void>;

    sendGcode(
        gcode: string,
    ): Promise<void>;

    startPrint(
        print: RealPrintPayload,
    ): Promise<void>;

    startTestPrint(
        gcode: ParsedGcode,
    ): Promise<void>;

    pausePrint(): Promise<void>;
    resumePrint(): Promise<void>;
    stopPrint(): Promise<void>;
    resetPrint(): Promise<void>;

    onEvent(
        listener: (
            event: PrinterEvent,
        ) => void,
    ): () => void;
}