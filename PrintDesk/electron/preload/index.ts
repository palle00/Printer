import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
  webUtils,
} from "electron";

import type {
  DesktopApi,
} from "../../src/types/desktop";

import {
  PRINTER_IPC,
  type NativeSerialPortInfo,
  type PrinterApi,
  type PrinterConnectionResult,
  type RealPrintPayload,
  type TestPrintPayload,
} from "../../src/types/printer-ipc";

import type {
  PrinterEvent,
} from "../../src/types/printer";
import type { ObjectCancellationProtocol } from "../../src/types/gcode";
import {
  DESKTOP_IPC,
  type DesktopFileApi,
  type DesktopSettingsApi,
} from "../../src/types/desktop-files";
import type {
  NotificationPreferences,
} from "../../src/types/settings";
import type { OperationsSettings } from "../../src/types/operations";

const fileApi: DesktopFileApi =
  Object.freeze({
    chooseGcodeFile() {
      return ipcRenderer.invoke(
        DESKTOP_IPC.chooseGcodeFile,
      );
    },
    readDroppedFile(file: File) {
      const filePath =
        webUtils.getPathForFile(file);

      if (!filePath) {
        return Promise.reject(
          new Error(
            "The dropped file has no local path.",
          ),
        );
      }

      return ipcRenderer.invoke(
        DESKTOP_IPC.readGcodePath,
        filePath,
      );
    },
    openRecentFile(path: string) {
      return ipcRenderer.invoke(
        DESKTOP_IPC.readGcodePath,
        path,
      );
    },
    markOpened(path: string) {
      return ipcRenderer.invoke(
        DESKTOP_IPC.markGcodeOpened,
        path,
      );
    },
    removeRecent(path: string) {
      return ipcRenderer.invoke(
        DESKTOP_IPC.removeRecentFile,
        path,
      );
    },
    clearRecent() {
      return ipcRenderer.invoke(
        DESKTOP_IPC.clearRecentFiles,
      );
    },
    onOpenRequested(listener: (path: string) => void) {
      const handler = (_event: IpcRendererEvent, requestedPath: string): void => listener(requestedPath);
      ipcRenderer.on(DESKTOP_IPC.openGcodeRequested, handler);
      return () => ipcRenderer.removeListener(DESKTOP_IPC.openGcodeRequested, handler);
    },
  });

const settingsApi:
  DesktopSettingsApi =
  Object.freeze({
    get() {
      return ipcRenderer.invoke(
        DESKTOP_IPC.getSettings,
      );
    },
    updateNotifications(
      preferences:
        Partial<
          NotificationPreferences
        >,
    ) {
      return ipcRenderer.invoke(
        DESKTOP_IPC.updateNotifications,
        preferences,
      );
    },
    updateOperations(operations: OperationsSettings) {
      return ipcRenderer.invoke(DESKTOP_IPC.updateOperations, operations);
    },
    exportDiagnostics() {
      return ipcRenderer.invoke(DESKTOP_IPC.exportDiagnostics);
    },
    exportFailureReport(reportId: string) {
      return ipcRenderer.invoke(DESKTOP_IPC.exportFailureReport, reportId);
    },
  });

const printerApi: PrinterApi =
  Object.freeze({
    listPorts():
      Promise<NativeSerialPortInfo[]> {
      return ipcRenderer.invoke(
        PRINTER_IPC.listPorts,
      ) as Promise<
        NativeSerialPortInfo[]
      >;
    },

    connect(
      path: string,
      baudRate = 115200,
    ): Promise<PrinterConnectionResult> {
      return ipcRenderer.invoke(
        PRINTER_IPC.connect,
        path,
        baudRate,
      ) as Promise<PrinterConnectionResult>;
    },

    disconnect(): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.disconnect,
      ) as Promise<void>;
    },

    sendGcode(
      gcode: string,
    ): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.sendGcode,
        gcode,
      ) as Promise<void>;
    },

    startPrint(
      print: RealPrintPayload,
    ): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.startPrint,
        print,
      ) as Promise<void>;
    },

    startTestPrint(
      print: TestPrintPayload,
    ): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.startTestPrint,
        print,
      ) as Promise<void>;
    },

    pausePrint(): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.pausePrint,
      ) as Promise<void>;
    },

    resumePrint(): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.resumePrint,
      ) as Promise<void>;
    },

    stopPrint(): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.stopPrint,
      ) as Promise<void>;
    },

    resetPrint(): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.resetPrint,
      ) as Promise<void>;
    },

    emergencyStop(): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.emergencyStop,
      ) as Promise<void>;
    },
    cancelObject(protocol: ObjectCancellationProtocol, objectId: string): Promise<void> {
      return ipcRenderer.invoke(PRINTER_IPC.cancelObject, protocol, objectId) as Promise<void>;
    },

    onEvent(
      listener: (
        event: PrinterEvent,
      ) => void,
    ): () => void {
      const handler = (
        _ipcEvent:
          IpcRendererEvent,

        printerEvent:
          PrinterEvent,
      ): void => {
        listener(printerEvent);
      };

      ipcRenderer.on(
        PRINTER_IPC.event,
        handler,
      );

      return (): void => {
        ipcRenderer.removeListener(
          PRINTER_IPC.event,
          handler,
        );
      };
    },
  });

const desktopApi: DesktopApi =
  Object.freeze({
    isElectron: true,

    platform:
      process.platform,

    versions:
      Object.freeze({
        electron:
          process.versions.electron,

        chrome:
          process.versions.chrome,

        node:
          process.versions.node,
      }),

    printer: printerApi,
    files: fileApi,
    settings: settingsApi,
  });

contextBridge.exposeInMainWorld(
  "desktop",
  desktopApi,
);
