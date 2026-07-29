import { usePrinterDashboard } from "./hooks/usePrinterDashboard";
import AppHeader from "./components/AppHeader";
import ErrorBanner from "./components/ErrorBanner";
import FilePanel from "./components/FilePanel";
import PrintJobPanel from "./components/PrintJobPanel";
import JogControls from "./components/JogControls";
import PreviewPanel from "./components/PreviewPanel";
import TemperaturePanel from "./components/TemperaturePanel";
import TerminalPanel from "./components/TerminalPanel";

export default function App() {
  const dashboard = usePrinterDashboard();

  return (
    <div className="min-h-screen bg-[#0b0e14] text-gray-300 flex flex-col">
      <AppHeader
        status={dashboard.displayStatus}
        isTestMode={dashboard.testPrint.isTestMode}
        connected={dashboard.printer.connected}
        hasActivePrint={dashboard.hasActivePrint}
        onToggleConnection={dashboard.toggleConnection}
        onStopPrint={dashboard.stopActivePrint}
      />

      <ErrorBanner
        error={dashboard.error}
        onClear={dashboard.clearError}
      />

      <main className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 p-4">
        <section className="xl:col-span-3 flex flex-col gap-4">
          <FilePanel
            gcode={dashboard.gcode}
            isLoading={dashboard.isLoading}
            hasActivePrint={dashboard.hasActivePrint}
            onFileChange={dashboard.handleFileInput}
            onClearFile={dashboard.clearFile}
          />

          <PrintJobPanel
            gcode={dashboard.gcode}
            progress={dashboard.displayProgress}
            connected={dashboard.printer.connected}
            printerStatus={dashboard.printer.status}
            testStatus={dashboard.testPrint.status}
            isTestMode={dashboard.testPrint.isTestMode}
            canStartPrint={dashboard.canStartPrint}
            canStartTestPrint={dashboard.canStartTestPrint}
            onStartPrint={dashboard.startPrint}
            onStartTestPrint={dashboard.startTestPrint}
            onPausePrint={dashboard.printer.pausePrint}
            onResumePrint={dashboard.printer.resumePrint}
            onStopPrint={dashboard.printer.stopPrint}
            onPauseTest={dashboard.testPrint.pauseTestPrint}
            onResumeTest={dashboard.testPrint.resumeTestPrint}
            onStopTest={dashboard.testPrint.stopTestPrint}
            onResetTest={dashboard.testPrint.resetTestPrint}
          />

          <JogControls
            connected={dashboard.printer.connected}
            disabled={dashboard.hasActivePrint}
            sendGcode={dashboard.printer.sendGcode}
          />
        </section>

        <PreviewPanel
          gcode={dashboard.gcode}
          progress={dashboard.displayProgress}
          position={dashboard.displayPosition}
          connected={dashboard.printer.connected}
          isTestMode={dashboard.testPrint.isTestMode}
          hasActivePrint={dashboard.hasActivePrint}
        />

        <section className="xl:col-span-3 flex flex-col gap-4">
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
  );
}