import { useCallback, useState } from "react";

import type { OperationsTab } from "../components/operations/OperationsDialog";
import type { PrinterDetectionReview } from "../components/PrinterDetectionDialog";
import { useOperationsSettings } from "./useOperationsSettings";
import { usePrintAccounting } from "./usePrintAccounting";
import { usePrinterDashboard } from "./usePrinterDashboard";
import { useRecoveryCheckpoint } from "./useRecoveryCheckpoint";

export function usePrintDeckApplication() {
  const operationsState = useOperationsSettings();
  const dashboard = usePrinterDashboard(operationsState.operations);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const [portPickerOpen, setPortPickerOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [operationsTab, setOperationsTab] = useState<OperationsTab>("profiles");
  const [printerDetectionReview, setPrinterDetectionReview] =
    useState<PrinterDetectionReview | null>(null);

  usePrintAccounting(
    dashboard.printer,
    dashboard.gcode,
    operationsState.operations,
    operationsState.update,
  );
  useRecoveryCheckpoint(
    dashboard.printer,
    dashboard.gcode,
    operationsState.update,
  );

  const connectAndDetect = useCallback(
    async (path: string, baudRate: number): Promise<void> => {
      const connection = await dashboard.printer.connect(path, baudRate);
      const detected = connection.detectedPrinter;
      if (!detected) return;

      const isKnownPrinter =
        operationsState.operations.profiles.some(
          (profile) => profile.identityKey === detected.identityKey,
        ) ||
        operationsState.operations.dismissedPrinterIdentities.includes(
          detected.identityKey,
        );
      if (!isKnownPrinter) {
        setPrinterDetectionReview({ detected, path, baudRate });
      }
    }, [dashboard.printer, operationsState.operations],
  );

  const openOperations = useCallback((tab: OperationsTab): void => {
    setOperationsTab(tab);
    setOperationsOpen(true);
  }, []);

  const toggleConnection = useCallback((): void => {
    if (dashboard.printer.connected) {
      dashboard.printer.disconnect();
      return;
    }

    dashboard.resetPrint();
    setPortPickerOpen(true);
  }, [dashboard]);

  const queueRecentFile = useCallback(
    (file: { path: string; name: string }): void => {
      operationsState.update((current) =>
        current.queue.some((item) => item.path === file.path)
          ? current
          : {
              ...current,
              queue: [
                ...current.queue,
                {
                  id: crypto.randomUUID(),
                  path: file.path,
                  name: file.name,
                  addedAt: Date.now(),
                },
              ],
            },
      );
    },
    [operationsState.update],
  );

  return {
    dashboard,
    operations: operationsState.operations,
    updateOperations: operationsState.update,
    notificationSettingsOpen,
    portPickerOpen,
    operationsOpen,
    operationsTab,
    printerDetectionReview,
    connectAndDetect,
    openOperations,
    toggleConnection,
    queueRecentFile,
    openNotificationSettings: () => setNotificationSettingsOpen(true),
    closeNotificationSettings: () => setNotificationSettingsOpen(false),
    closePortPicker: () => setPortPickerOpen(false),
    closeOperations: () => setOperationsOpen(false),
    clearPrinterDetectionReview: () => setPrinterDetectionReview(null),
  };
}

export type PrintDeckApplicationController = ReturnType<
  typeof usePrintDeckApplication
>;
