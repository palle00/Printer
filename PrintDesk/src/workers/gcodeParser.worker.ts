/// <reference lib="webworker" />

import {
  parseGcode,
} from "../utils/gcodeParser";
import { createComparisonSummary } from "../types/gcode-comparison";

interface ParseRequest {
  fileName: string;
  text: string;
  filePath: string;
  fileSize: number;
  fileSha256: string;
  mode?: "preview" | "summary";
}

self.onmessage = (
  event: MessageEvent<ParseRequest>,
): void => {
  try {
    const {
      fileName,
      text,
      filePath,
      fileSize,
      fileSha256,
    } = event.data;
    const parsed = parseGcode(
      fileName,
      text,
      {
        filePath,
        fileSize,
        fileSha256,
        includeGeometry: event.data.mode !== "summary",
      },
    );
    if (event.data.mode === "summary") {
      self.postMessage({ summary: createComparisonSummary(parsed) });
      return;
    }
    const transfers: Transferable[] = [
      parsed.segments.coordinates
        .buffer as ArrayBuffer,
      parsed.segments.commandIndexes
        .buffer as ArrayBuffer,
      parsed.segments.layers
        .buffer as ArrayBuffer,
      parsed.segments.extruding
        .buffer as ArrayBuffer,
      parsed.segments.featureIndexes
        .buffer as ArrayBuffer,
      parsed.commandLayers
        .buffer as ArrayBuffer,
      parsed.timing.cumulativeSeconds
        .buffer as ArrayBuffer,
    ];

    self.postMessage(
      {
        parsed,
      },
      {
        transfer: transfers,
      },
    );
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
};
