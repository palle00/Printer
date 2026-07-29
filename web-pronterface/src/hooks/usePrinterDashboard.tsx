import { useEffect } from "react";
import { usePrinter } from "./usePrinter";
import { useTestPrint } from "./useTestPrint";
import { useGcode } from "./useGcode";

export function usePrinterDashboard() {
  const printer = usePrinter();
  const testPrint = useTestPrint();

  const {
    gcode,
    isLoading,
    error: fileError,
    handleFileInput,
    clearFile,
  } = useGcode();

  const isRealPrintActive =
    printer.status === "printing" ||
    printer.status === "pausing" ||
    printer.status === "paused" ||
    printer.status === "stopping";

  const isTestPrintActive =
    testPrint.status === "printing" ||
    testPrint.status === "pausing" ||
    testPrint.status === "paused" ||
    testPrint.status === "stopping";

  const hasActivePrint =
    isRealPrintActive || isTestPrintActive;

  const canStartPrint =
    printer.connected &&
    printer.status === "idle" &&
    gcode !== null;

  const canStartTestPrint =
    !printer.connected &&
    gcode !== null &&
    !isTestPrintActive;

  const displayStatus = testPrint.isTestMode
    ? testPrint.status
    : printer.status;

  const displayProgress = testPrint.isTestMode
    ? testPrint.progress
    : printer.progress;

  const displayPosition = testPrint.isTestMode
    ? testPrint.position
    : printer.position;

  const error =
    printer.error ?? fileError ?? null;

  const clearError = printer.error
    ? printer.clearError
    : undefined;

  useEffect(() => {
    testPrint.resetTestPrint();
  }, [
    gcode?.fileName,
    testPrint.resetTestPrint,
  ]);

  const toggleConnection = async () => {
    if (printer.connected) {
      await printer.disconnect();
      return;
    }

    testPrint.resetTestPrint();
    await printer.connect();
  };

  const startPrint = () => {
    if (!gcode || !canStartPrint) {
      return;
    }

    printer.startPrint(
      gcode.fileName,
      gcode.text,
    );
  };

  const startTestPrint = () => {
    if (!gcode || !canStartTestPrint) {
      return;
    }

    testPrint.startTestPrint(gcode);
  };

  const stopActivePrint = () => {
    if (testPrint.isTestMode) {
      testPrint.stopTestPrint();
      return;
    }

    printer.stopPrint();
  };

  return {
    printer,
    testPrint,

    gcode,
    isLoading,
    handleFileInput,
    clearFile,

    isRealPrintActive,
    isTestPrintActive,
    hasActivePrint,

    canStartPrint,
    canStartTestPrint,

    displayStatus,
    displayProgress,
    displayPosition,

    error,
    clearError,

    toggleConnection,
    startPrint,
    startTestPrint,
    stopActivePrint,
  };
}

export type PrinterDashboard =
  ReturnType<typeof usePrinterDashboard>;