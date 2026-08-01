import AppHeader from "../AppHeader";
import AppSidebar from "../AppSidebar";
import ErrorBanner from "../ErrorBanner";
import FilePanel from "../FilePanel";
import PreviewPanel from "../PreviewPanel";
import PrintJobPanel from "../PrintJobPanel";
import PrinterInfoPanel from "../PrinterInfoPanel";
import PrinterStatusPanel from "../PrinterStatusPanel";
import TemperaturePanel from "../TemperaturePanel";
import TerminalPanel from "../TerminalPanel";
import FirmwareFaultPanel from "../FirmwareFaultPanel";
import type { PrintDeckApplicationController } from "../../hooks/usePrintDeckApplication";

interface DashboardLayoutProps {
  controller: PrintDeckApplicationController;
}

export default function DashboardLayout({ controller }: DashboardLayoutProps) {
  const { dashboard, operations } = controller;

  return (
    <>
      <AppHeader
        connected={dashboard.printer.connected}
        hasActivePrint={dashboard.hasActivePrint}
        onToggleConnection={controller.toggleConnection}
        onOpenNotifications={controller.openNotificationSettings}
        onOpenOperations={() => controller.openOperations("profiles")}
      />
      <ErrorBanner error={dashboard.error} onClear={dashboard.clearError} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar
          activeProfile={dashboard.activeProfile}
          queueCount={operations.queue.length}
          onOpen={controller.openOperations}
        />
        <main className="app-main grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[minmax(14rem,17rem)_minmax(26rem,1fr)_minmax(17rem,21rem)]">
          <section className="app-column flex min-h-0 flex-col gap-3 overflow-y-auto">
            <FilePanel
              gcode={dashboard.gcode}
              recentFiles={dashboard.recentFiles}
              staleRecentPath={dashboard.staleRecentPath}
              isLoading={dashboard.isLoading}
              hasActivePrint={dashboard.hasActivePrint}
              onChooseFile={dashboard.chooseFile}
              onOpenRecent={dashboard.openRecentFile}
              onRemoveRecent={dashboard.removeRecentFile}
              onClearRecent={dashboard.clearRecentFiles}
              onClearFile={dashboard.clearFile}
              onQueueRecent={controller.queueRecentFile}
            />
          </section>

          <section className="app-column flex min-h-0 flex-col gap-3 overflow-y-auto">
            <div className="min-h-[20rem] flex-1">
              <PreviewPanel
                gcode={dashboard.gcode}
                progress={dashboard.displayProgress}
                position={dashboard.displayPosition}
                connected={dashboard.printer.connected}
                isTestMode={dashboard.isTestMode}
                hasActivePrint={dashboard.hasActivePrint}
              />
            </div>
            <div className="shrink-0">
              <PrintJobPanel
                gcode={dashboard.gcode}
                progress={dashboard.displayProgress}
                connected={dashboard.printer.connected}
                status={dashboard.displayStatus}
                isTestMode={dashboard.isTestMode}
                canStartPrint={dashboard.canStartPrint}
                canStartTestPrint={dashboard.canStartTestPrint}
                onStartPrint={dashboard.startPrint}
                onStartTestPrint={dashboard.startTestPrint}
                onPause={dashboard.pausePrint}
                onResume={dashboard.resumePrint}
                onStop={dashboard.stopPrint}
                onEmergencyStop={dashboard.printer.emergencyStop}
                onReset={dashboard.resetPrint}
                preflightIssues={dashboard.preflightIssues}
                activeProfile={dashboard.activeProfile}
                activeSpool={operations.spools.find((spool) => spool.id === operations.activeSpoolId) ?? null}
                cancelledObjectIds={dashboard.printer.cancelledObjectIds}
                onCancelObject={dashboard.cancelObject}
              />
            </div>
          </section>

          <section className="app-column flex min-h-0 flex-col gap-3 overflow-y-auto">
            <FirmwareFaultPanel faults={dashboard.printer.faults} reconnecting={dashboard.printer.reconnecting} onClear={dashboard.printer.clearFaults} />
            <PrinterStatusPanel
              profile={dashboard.activeProfile}
              connected={dashboard.printer.connected}
              status={dashboard.displayStatus}
              position={dashboard.displayPosition}
            />
            <TemperaturePanel
              hotend={dashboard.printer.hotend}
              targetHotend={dashboard.printer.targetHotend}
              bed={dashboard.printer.bed}
              targetBed={dashboard.printer.targetBed}
              history={dashboard.printer.temperatureHistory}
              connected={dashboard.printer.connected}
              hasActivePrint={dashboard.hasActivePrint}
              sendGcode={dashboard.printer.sendGcode}
            />
            <PrinterInfoPanel profile={dashboard.activeProfile} />
            <TerminalPanel
              lines={dashboard.printer.terminal}
              connected={dashboard.printer.connected}
              hasActivePrint={dashboard.hasActivePrint}
              sendGcode={dashboard.printer.sendGcode}
              clearTerminal={dashboard.printer.clearTerminal}
            />
          </section>
        </main>
      </div>
    </>
  );
}
