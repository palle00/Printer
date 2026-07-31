import {
  useCallback,
  useEffect,
} from "react";
import type { OperationsSettings } from "../types/operations";
import { canPrintAfterPreflight, inspectPrint } from "../print/preflight";

import {
  usePrinter,
} from "./usePrinter";

import {
  useGcode,
} from "./useGcode";

export function usePrinterDashboard(operations: OperationsSettings) {
  const printer =
    usePrinter();

  const hasActivePrint =
    printer.status ===
      "printing" ||
    printer.status ===
      "pausing" ||
    printer.status ===
      "paused" ||
    printer.status ===
      "stopping";

  const {
    gcode,
    recentFiles,
    staleRecentPath,
    isLoading,

    error: fileError,

    chooseFile,
    loadDroppedFile,
    openRecentFile,
    removeRecentFile,
    clearRecentFiles,
    clearFile,
    clearError: clearFileError,
  } = useGcode({
    hasActivePrint,
  });

  const activeProfile = operations.profiles.find((profile) => profile.id === operations.activeProfileId) ?? operations.profiles[0];
  const activeSpool = operations.spools.find((spool) => spool.id === operations.activeSpoolId) ?? null;
  const preflightIssues = gcode && activeProfile ? inspectPrint(gcode, activeProfile, activeSpool) : [];
  const canStartPrint =
    printer.connected &&
    printer.status === "idle" &&
    !printer.isTestMode &&
    !isLoading &&
    gcode !== null && canPrintAfterPreflight(preflightIssues);

  const canStartTestPrint =
    !printer.connected &&
    !hasActivePrint &&
    !isLoading &&
    gcode !== null;

  useEffect(() => {
    printer.resetPrint();
  }, [
    gcode,
    printer.resetPrint,
  ]);

  useEffect(() => window.desktop.files.onOpenRequested((path) => {
    void openRecentFile(path);
  }), [openRecentFile]);

  const startPrint = useCallback(() => {
    if (
      !gcode ||
      !canStartPrint
    ) {
      return;
    }

    printer.startPrint(gcode);
  }, [
    canStartPrint,
    gcode,
    printer.startPrint,
  ]);

  const startTestPrint = useCallback(() => {
    if (
      !gcode ||
      !canStartTestPrint
    ) {
      return;
    }

    printer.startTestPrint(
      gcode,
    );
  }, [
    canStartTestPrint,
    gcode,
    printer.startTestPrint,
  ]);

  return {
    printer,

    gcode,
    recentFiles,
    staleRecentPath,
    isLoading,

    chooseFile,
    loadDroppedFile,
    openRecentFile,
    removeRecentFile,
    clearRecentFiles,
    clearFile,

    hasActivePrint,
    canStartPrint,
    canStartTestPrint,
    preflightIssues,
    activeProfile,

    isTestMode:
      printer.isTestMode,

    displayStatus:
      printer.status,

    displayProgress:
      printer.progress,

    displayPosition:
      printer.position,

    error:
      printer.error ??
      fileError ??
      null,

    clearError:
      printer.error
        ? printer.clearError
        : fileError
          ? clearFileError
          : undefined,

    startPrint,
    startTestPrint,

    pausePrint:
      printer.pausePrint,

    resumePrint:
      printer.resumePrint,

    stopPrint:
      printer.stopPrint,

    resetPrint:
      printer.resetPrint,
    cancelObject: printer.cancelObject,
  };
}
