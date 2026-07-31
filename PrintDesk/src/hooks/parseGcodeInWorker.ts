import {
  GcodeSegmentStore,
} from "../gcode/GcodeSegmentStore";
import type {
  ParsedGcode,
} from "../types/gcode";
import type { GcodeComparisonSummary } from "../types/gcode-comparison";

interface SerializedResult {
  parsed?: ParsedGcode;
  error?: string;
  summary?: GcodeComparisonSummary;
}

export function parseGcodeSummaryInWorker(fileName: string, text: string, filePath: string, fileSize: number, fileSha256: string): Promise<GcodeComparisonSummary> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/gcodeParser.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<SerializedResult>) => {
      worker.terminate();
      if (event.data.summary) resolve(event.data.summary);
      else reject(new Error(event.data.error ?? "G-code comparison failed."));
    };
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || "G-code comparison failed.")); };
    worker.postMessage({ fileName, text, filePath, fileSize, fileSha256, mode: "summary" });
  });
}

export interface GcodeParseJob {
  promise: Promise<ParsedGcode>;
  cancel(): void;
}

export function parseGcodeInWorker(
  fileName: string,
  text: string,
  filePath: string,
  fileSize: number,
  fileSha256: string,
): GcodeParseJob {
  const worker = new Worker(
    new URL(
      "../workers/gcodeParser.worker.ts",
      import.meta.url,
    ),
    {
      type: "module",
    },
  );
  let settled = false;
  let rejectJob:
    ((reason: Error) => void) |
    null = null;
  const promise =
    new Promise<ParsedGcode>(
      (resolve, reject) => {
        rejectJob = reject;
        worker.onmessage = (
          event:
            MessageEvent<SerializedResult>,
        ) => {
          settled = true;
          worker.terminate();

          if (
            event.data.error ||
            !event.data.parsed
          ) {
            reject(
              new Error(
                event.data.error ??
                  "G-code parsing failed.",
              ),
            );
            return;
          }

          const parsed =
            event.data.parsed;
          const serialized =
            parsed.segments;

          parsed.segments =
            new GcodeSegmentStore(
              serialized.coordinates,
              serialized.commandIndexes,
              serialized.layers,
              serialized.extruding,
              serialized.featureIndexes,
            );
          resolve(parsed);
        };
        worker.onerror = (
          event,
        ) => {
          settled = true;
          worker.terminate();
          reject(
            new Error(
              event.message ||
                "G-code parsing failed.",
            ),
          );
        };
      },
    );

  worker.postMessage({
    fileName,
    text,
    filePath,
    fileSize,
    fileSha256,
  });

  return {
    promise,
    cancel() {
      if (settled) {
        return;
      }

      settled = true;
      worker.terminate();
      rejectJob?.(
        new Error(
          "G-code parsing was cancelled.",
        ),
      );
    },
  };
}
