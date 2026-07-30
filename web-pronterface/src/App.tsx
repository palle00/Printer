import {
  usePrinterDashboard,
} from "./hooks/usePrinterDashboard";
import {
  useRef,
  useState,
  type DragEvent,
} from "react";

import AppHeader from "./components/AppHeader";
import ErrorBanner from "./components/ErrorBanner";
import FilePanel from "./components/FilePanel";
import PrintJobPanel from "./components/PrintJobPanel";
import JogControls from "./components/JogControls";
import PreviewPanel from "./components/PreviewPanel";
import TemperaturePanel from "./components/TemperaturePanel";
import TerminalPanel from "./components/TerminalPanel";
import NotificationSettings from "./components/NotificationSettings";
import PortPickerDialog from "./components/PortPickerDialog";

export default function App() {
  const dashboard =
    usePrinterDashboard();
  const dragDepth =
    useRef(0);
  const [isDraggingFile, setIsDraggingFile] =
    useState(false);
  const [
    notificationSettingsOpen,
    setNotificationSettingsOpen,
  ] = useState(false);
  const [
    portPickerOpen,
    setPortPickerOpen,
  ] = useState(false);

  const handleToggleConnection = (): void => {
    if (
      dashboard.printer.connected
    ) {
      dashboard.printer.disconnect();
      return;
    }

    dashboard.resetPrint();
    setPortPickerOpen(true);
  };

  const handleDragEnter = (
    event: DragEvent<HTMLDivElement>,
  ): void => {
    event.preventDefault();

    if (
      dashboard.hasActivePrint
    ) {
      dragDepth.current = 0;
      setIsDraggingFile(false);
      return;
    }

    dragDepth.current++;

    if (
      Array.from(
        event.dataTransfer.types,
      ).includes("Files")
    ) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (
    event: DragEvent<HTMLDivElement>,
  ): void => {
    event.preventDefault();
    dragDepth.current =
      Math.max(
        0,
        dragDepth.current - 1,
      );

    if (dragDepth.current === 0) {
      setIsDraggingFile(false);
    }
  };

  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
  ): void => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDraggingFile(false);
    const files =
      Array.from(
        event.dataTransfer.files,
      );

    if (files.length !== 1) {
      return;
    }

    void dashboard.loadDroppedFile(
      files[0],
    );
  };

  return (
    <div
      className="app-shell relative h-dvh overflow-hidden bg-[#0b0e14] text-gray-300 flex flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect =
          dashboard.hasActivePrint
            ? "none"
            : "copy";
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AppHeader
        status={
          dashboard.displayStatus
        }
        isTestMode={
          dashboard.isTestMode
        }
        connected={
          dashboard.printer
            .connected
        }
        hasActivePrint={
          dashboard.hasActivePrint
        }
        onToggleConnection={
          handleToggleConnection
        }
        onStopPrint={
          dashboard.stopPrint
        }
        onOpenNotifications={() =>
          setNotificationSettingsOpen(
            true,
          )
        }
      />

      <ErrorBanner
        error={dashboard.error}
        onClear={
          dashboard.clearError
        }
      />

      <main className="app-main min-h-0 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-hidden">
        <section className="app-column min-h-0 lg:col-span-3 flex flex-col gap-4 overflow-y-auto">
          <FilePanel
            gcode={dashboard.gcode}
            recentFiles={
              dashboard.recentFiles
            }
            staleRecentPath={
              dashboard
                .staleRecentPath
            }
            isLoading={
              dashboard.isLoading
            }
            hasActivePrint={
              dashboard
                .hasActivePrint
            }
            onChooseFile={
              dashboard
                .chooseFile
            }
            onOpenRecent={
              dashboard
                .openRecentFile
            }
            onRemoveRecent={
              dashboard
                .removeRecentFile
            }
            onClearRecent={
              dashboard
                .clearRecentFiles
            }
            onClearFile={
              dashboard.clearFile
            }
          />

          <PrintJobPanel
            gcode={dashboard.gcode}
            progress={
              dashboard
                .displayProgress
            }
            connected={
              dashboard.printer
                .connected
            }
            status={
              dashboard.displayStatus
            }
            isTestMode={
              dashboard.isTestMode
            }
            canStartPrint={
              dashboard
                .canStartPrint
            }
            canStartTestPrint={
              dashboard
                .canStartTestPrint
            }
            onStartPrint={
              dashboard.startPrint
            }
            onStartTestPrint={
              dashboard
                .startTestPrint
            }
            onPause={
              dashboard.pausePrint
            }
            onResume={
              dashboard.resumePrint
            }
            onStop={
              dashboard.stopPrint
            }
            onReset={
              dashboard.resetPrint
            }
          />

          <JogControls
            connected={
              dashboard.printer
                .connected
            }
            disabled={
              dashboard
                .hasActivePrint
            }
            sendGcode={
              dashboard.printer
                .sendGcode
            }
          />
        </section>

        <PreviewPanel
          gcode={dashboard.gcode}
          progress={
            dashboard
              .displayProgress
          }
          position={
            dashboard
              .displayPosition
          }
          connected={
            dashboard.printer
              .connected
          }
          isTestMode={
            dashboard.isTestMode
          }
          hasActivePrint={
            dashboard
              .hasActivePrint
          }
        />

        <section className="app-column min-h-0 lg:col-span-3 flex flex-col gap-4 overflow-y-auto">
          <TemperaturePanel
            hotend={
              dashboard.printer
                .hotend
            }
            targetHotend={
              dashboard.printer
                .targetHotend
            }
            bed={
              dashboard.printer
                .bed
            }
            targetBed={
              dashboard.printer
                .targetBed
            }
            history={
              dashboard.printer
                .temperatureHistory
            }
            connected={
              dashboard.printer
                .connected
            }
            hasActivePrint={
              dashboard
                .hasActivePrint
            }
            sendGcode={
              dashboard.printer
                .sendGcode
            }
          />

          <TerminalPanel
            lines={
              dashboard.printer
                .terminal
            }
            connected={
              dashboard.printer
                .connected
            }
            hasActivePrint={
              dashboard
                .hasActivePrint
            }
            sendGcode={
              dashboard.printer
                .sendGcode
            }
            clearTerminal={
              dashboard.printer
                .clearTerminal
            }
          />
        </section>
      </main>
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-0 z-[100] grid place-items-center border-2 border-blue-500 bg-[#0b0e14]/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-blue-300">
            <span
              className="text-3xl"
              aria-hidden="true"
            >
              ↓
            </span>
            <span className="text-sm font-semibold">
              Drop one G-code file
            </span>
            <span className="text-xs text-gray-500">
              G-code, GCO, GC, or G
            </span>
          </div>
        </div>
      )}
      <NotificationSettings
        open={
          notificationSettingsOpen
        }
        onClose={() =>
          setNotificationSettingsOpen(
            false,
          )
        }
      />
      <PortPickerDialog
        open={portPickerOpen}
        onClose={() =>
          setPortPickerOpen(false)
        }
        onConnect={
          dashboard.printer.connect
        }
      />
    </div>
  );
}
