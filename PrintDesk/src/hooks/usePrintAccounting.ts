import { useEffect, useRef } from "react";
import type { ParsedGcode } from "../types/gcode";
import type { OperationsSettings } from "../types/operations";
import type { PrinterState } from "../types/printer";

interface ActiveJob { startedAt: number; fileName: string; mode: "real" | "test"; profileId: string | null; filamentGrams: number | null; faultCount: number }

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
      job.current = { startedAt: Date.now(), fileName: printer.progress.fileName, mode: printer.mode, profileId: operations.activeProfileId, filamentGrams: gcode?.statistics.filamentWeightGrams ?? null, faultCount: printer.faults.length };
      return;
    }
    if (active || !job.current) return;

    const finished = job.current;
    job.current = null;
    const elapsedSeconds = printer.progress.elapsedSeconds;
    const hasNewFault = printer.faults.length > finished.faultCount;
    const outcome: "completed" | "stopped" | "disconnected" | "failed" = printer.status === "disconnected" ? "disconnected" : printer.progress.percent >= 100 ? "completed" : hasNewFault ? "failed" : "stopped";
    update((current) => {
      const shouldAccount = outcome === "completed" && finished.mode === "real";
      const filamentGrams = shouldAccount ? finished.filamentGrams ?? 0 : 0;
      const hours = shouldAccount ? elapsedSeconds / 3600 : 0;
      const latestFault = hasNewFault ? printer.faults.at(-1) : null;
      const lastCommand = [...printer.terminal].reverse().find((line) => line.startsWith("> ")) ?? null;
      const failureReport = outcome !== "completed" && finished.mode === "real" ? {
        id: crypto.randomUUID(), fileName: finished.fileName, outcome, occurredAt: Date.now(), elapsedSeconds,
        commandIndex: printer.progress.currentLine, layer: printer.progress.currentLayer,
        position: { x: printer.position.x, y: printer.position.y, z: printer.position.z },
        temperatures: { hotend: printer.hotend, targetHotend: printer.targetHotend, bed: printer.bed, targetBed: printer.targetBed },
        message: latestFault?.message ?? printer.error, lastCommand, terminalLines: printer.terminal.slice(-50),
      } : null;
      return {
        ...current,
        history: [{ id: crypto.randomUUID(), fileName: finished.fileName, mode: finished.mode, outcome, startedAt: finished.startedAt, finishedAt: Date.now(), elapsedSeconds, profileId: finished.profileId, filamentUsedGrams: shouldAccount ? filamentGrams : null }, ...current.history].slice(0, 250),
        failureReports: failureReport ? [failureReport, ...current.failureReports].slice(0, 50) : current.failureReports,
        spools: current.spools.map((spool) => spool.id === current.activeSpoolId ? { ...spool, remainingGrams: Math.max(0, spool.remainingGrams - filamentGrams) } : spool),
        maintenance: current.maintenance.map((task) => ({ ...task, completedPrintHours: task.completedPrintHours + hours })),
      };
    });
  }, [active, gcode, operations.activeProfileId, printer.bed, printer.error, printer.faults, printer.hotend, printer.mode, printer.position.x, printer.position.y, printer.position.z, printer.progress.currentLayer, printer.progress.currentLine, printer.progress.elapsedSeconds, printer.progress.fileName, printer.progress.percent, printer.status, printer.targetBed, printer.targetHotend, printer.terminal, update]);
}
