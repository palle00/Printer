import type {
    PrinterEvent,
} from "./printer";
import type {
    EstimateConfidence,
} from "./gcode";
import type { ObjectCancellationProtocol } from "./gcode";
import type { DetectedPrinter } from "../printer/firmwareDetection";
import type {
    GcodeFileFingerprint,
} from "./gcode-file";

export interface RealPrintTimingPayload {
    cumulativeSeconds:
        Float32Array<ArrayBufferLike>;
    totalSeconds: number;
    heatingSeconds: number;
    source: "slicer" | "motion";
    confidence: EstimateConfidence;
}

export interface RealPrintPayload {
    source: GcodeFileFingerprint;
    commandLayers:
        Uint32Array<ArrayBufferLike>;
    totalLayers: number;
    timing: RealPrintTimingPayload;
}

export interface TestPrintPath {
    coordinates: Float32Array<ArrayBufferLike>;
    commandIndexes: Uint32Array<ArrayBufferLike>;
    layers: Uint32Array<ArrayBufferLike>;
    extruding: Uint8Array<ArrayBufferLike>;
}

export interface TestPrintPayload {
    fileName: string;
    printableLines: number;
    totalLayers: number;
    path: TestPrintPath;
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

    emergencyStop:
        "printer:emergency-stop",

    resetPrint:
        "printer:reset-print",

    cancelObject:
        "printer:cancel-object",

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
    detectedPrinter: DetectedPrinter | null;
}

export interface PrinterApi {
    listPorts():
        Promise<NativeSerialPortInfo[]>;

    connect(
        path: string,
        baudRate?: number,
    ): Promise<PrinterConnectionResult>;

    disconnect(): Promise<void>;

    sendGcode(
        gcode: string,
    ): Promise<void>;

    startPrint(
        print: RealPrintPayload,
    ): Promise<void>;

    startTestPrint(
        print: TestPrintPayload,
    ): Promise<void>;

    pausePrint(): Promise<void>;
    resumePrint(): Promise<void>;
    stopPrint(): Promise<void>;
    emergencyStop(): Promise<void>;
    resetPrint(): Promise<void>;
    cancelObject(protocol: ObjectCancellationProtocol, objectId: string): Promise<void>;

    onEvent(
        listener: (
            event: PrinterEvent,
        ) => void,
    ): () => void;
}
