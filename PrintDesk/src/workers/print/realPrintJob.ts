import type {
  RealPrintTimingPayload,
} from "../../types/printer-ipc";

export interface RealPrintCommandSource
  extends AsyncIterable<string> {
  close(): Promise<void>;
}

export interface RealPrintJob {
  fileName: string;
  commandSource:
    RealPrintCommandSource;
  commandLayers:
    Uint32Array<ArrayBufferLike>;
  totalLayers: number;
  timing: RealPrintTimingPayload;
}
