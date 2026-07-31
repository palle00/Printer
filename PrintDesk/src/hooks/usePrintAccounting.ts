import { useEffect, useRef } from "react";
import type { ParsedGcode } from "../types/gcode";
import type { OperationsSettings } from "../types/operations";
import type { PrinterState } from "../types/printer";

interface ActiveJob { startedAt: number; fileName: string; mode: "real" | "test"; profileId: string | null }

export function usePrintAccounting(
  printer: PrinterState,
  gcode: ParsedGcode | null,
  operations: OperationsSettings,
  update: (create: (current: OperationsSettings) => OperationsSettings) => void,
): void {
  const active = printer.status === "printing" || printer.status === "pausing" || printer.status === "paused" || printer.status === "stopping";
  const job = useRef<ActiveJob | null>(null);

  useEffect(() => {
    if (active && !job.current && printer.progress.fileName && printer.mode) {
      job.current = { startedAt: Date.now(), fileName: printer.progress.fileName, mode: printer.mode, profileId: operations.activeProfileId };
      return;
    }
    if (active || !job.current) return;

    const finished = job.current;
    job.current = null;
    const elapsedSeconds = printer.progress.elapsedSeconds;
    const outcome: "completed" | "stopped" | "disconnected" = printer.status === "disconnected" ? "disconnected" : printer.progress.percent >= 100 ? "completed" : "stopped";
    update((current) => {
      const shouldAccount = outcome === "completed" && finished.mode === "real";
      const filamentGrams = shouldAccount ? gcode?.statistics.filamentWeightGrams ?? 0 : 0;
      const hours = shouldAccount ? elapsedSeconds / 3600 : 0;
      return {
        ...current,
        history: [{ id: crypto.randomUUID(), fileName: finished.fileName, mode: finished.mode, outcome, startedAt: finished.startedAt, finishedAt: Date.now(), elapsedSeconds, profileId: finished.profileId }, ...current.history].slice(0, 250),
        spools: current.spools.map((spool) => spool.id === current.activeSpoolId ? { ...spool, remainingGrams: Math.max(0, spool.remainingGrams - filamentGrams) } : spool),
        maintenance: current.maintenance.map((task) => ({ ...task, completedPrintHours: task.completedPrintHours + hours })),
      };
    });
  }, [active, gcode, operations.activeProfileId, printer.mode, printer.progress.elapsedSeconds, printer.progress.fileName, printer.progress.percent, printer.status, update]);
}
