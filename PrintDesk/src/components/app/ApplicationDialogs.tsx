import NotificationSettings from "../NotificationSettings";
import OperationsDialog from "../operations/OperationsDialog";
import PortPickerDialog from "../PortPickerDialog";
import PrinterDetectionDialog from "../PrinterDetectionDialog";
import type { PrintDeckApplicationController } from "../../hooks/usePrintDeckApplication";

interface ApplicationDialogsProps {
  controller: PrintDeckApplicationController;
}

export default function ApplicationDialogs({
  controller,
}: ApplicationDialogsProps) {
  const { dashboard, operations, updateOperations } = controller;

  return (
    <>
      <NotificationSettings
        open={controller.notificationSettingsOpen}
        onClose={controller.closeNotificationSettings}
      />
      <PortPickerDialog
        open={controller.portPickerOpen}
        onClose={controller.closePortPicker}
        onConnect={controller.connectAndDetect}
        profiles={operations.profiles}
        activeProfileId={operations.activeProfileId}
        onSelectProfile={(profileId) =>
          updateOperations((current) => ({ ...current, activeProfileId: profileId }))
        }
      />
      <OperationsDialog
        open={controller.operationsOpen}
        settings={operations}
        gcode={dashboard.gcode}
        initialTab={controller.operationsTab}
        connected={dashboard.printer.connected}
        hasActivePrint={dashboard.hasActivePrint}
        onClose={controller.closeOperations}
        onChange={updateOperations}
        onSendMacro={dashboard.printer.sendGcode}
        onOpenQueued={dashboard.openRecentFile}
        onExportDiagnostics={() => window.desktop.settings.exportDiagnostics()}
        onExportFailureReport={(reportId) => window.desktop.settings.exportFailureReport(reportId)}
      />
      <PrinterDetectionDialog
        review={controller.printerDetectionReview}
        onDismiss={(identityKey) => {
          updateOperations((current) => ({
            ...current,
            dismissedPrinterIdentities: [
              ...new Set([...current.dismissedPrinterIdentities, identityKey]),
            ],
          }));
          controller.clearPrinterDetectionReview();
        }}
        onSave={(profile) => {
          updateOperations((current) => ({
            ...current,
            profiles: [...current.profiles, profile],
            activeProfileId: profile.id,
            dismissedPrinterIdentities:
              current.dismissedPrinterIdentities.filter(
                (identity) => identity !== profile.identityKey,
              ),
          }));
          controller.clearPrinterDetectionReview();
        }}
      />
    </>
  );
}
