import {
  useCallback,
  useEffect,
} from "react";

import {
  usePrinter,
} from "./usePrinter";

import {
  useGcode,
} from "./useGcode";

export function usePrinterDashboard() {
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

  const canStartPrint =
    printer.connected &&
    printer.status === "idle" &&
    !printer.isTestMode &&
    gcode !== null;

  const canStartTestPrint =
    !printer.connected &&
    !hasActivePrint &&
    gcode !== null;

  useEffect(() => {
    printer.resetPrint();
  }, [
    gcode?.fileName,
    printer.resetPrint,
  ]);

  const toggleConnection =
    useCallback(async () => {
      if (printer.connected) {
        printer.disconnect();
        return;
      }

      printer.resetPrint();

      await printer.connect();
    }, [
      printer.connected,
      printer.connect,
      printer.disconnect,
      printer.resetPrint,
    ]);

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

    toggleConnection,

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
  };
}
