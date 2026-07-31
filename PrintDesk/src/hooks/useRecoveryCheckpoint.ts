import { useEffect, useRef } from "react";
import type { ParsedGcode } from "../types/gcode";
import type { OperationsSettings } from "../types/operations";
import type { PrinterState } from "../types/printer";

const CHECKPOINT_INTERVAL_MS = 10_000;

export function useRecoveryCheckpoint(printer: PrinterState, gcode: ParsedGcode | null, update: (create: (current: OperationsSettings) => OperationsSettings) => void): void {
  const wasActive = useRef(false);
  const lastSavedAt = useRef(0);
  const lastLayer = useRef(0);
  const active = printer.mode === "real" && ["printing", "pausing", "paused", "stopping"].includes(printer.status);

  useEffect(() => {
    const now = Date.now();
    if (active && gcode?.filePath && gcode.fileSha256) {
      const shouldSave = now - lastSavedAt.current >= CHECKPOINT_INTERVAL_MS || printer.progress.currentLayer !== lastLayer.current;
      if (shouldSave) {
        lastSavedAt.current = now;
        lastLayer.current = printer.progress.currentLayer;
        update((current) => ({ ...current, recoveryCheckpoint: { fileName: gcode.fileName, filePath: gcode.filePath!, fileSha256: gcode.fileSha256!, commandIndex: printer.progress.currentLine, layer: printer.progress.currentLayer, totalLayers: printer.progress.totalLayers, elapsedSeconds: printer.progress.elapsedSeconds, capturedAt: now, state: "printing" } }));
      }
    } else if (wasActive.current) {
      if (printer.status === "disconnected") {
        update((current) => current.recoveryCheckpoint ? ({ ...current, recoveryCheckpoint: { ...current.recoveryCheckpoint, capturedAt: now, state: "interrupted" } }) : current);
      } else {
        update((current) => ({ ...current, recoveryCheckpoint: null }));
      }
    }
    wasActive.current = active;
  }, [active, gcode, printer.progress.currentLayer, printer.progress.currentLine, printer.progress.elapsedSeconds, printer.progress.totalLayers, printer.status, update]);
}
