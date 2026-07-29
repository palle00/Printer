import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
} from "electron";

import type {
  ParsedGcode,
} from "../../src/types/gcode";

import type {
  DesktopApi,
} from "../../src/types/desktop";

import {
  PRINTER_IPC,
  type NativeSerialPortInfo,
  type PrinterApi,
  type PrinterConnectionResult,
  type RealPrintPayload,
} from "../../src/types/printer-ipc";

import type {
  PrinterEvent,
} from "../../src/types/printer";

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
      baudRate = 115200,
    ): Promise<
      PrinterConnectionResult | null
    > {
      return ipcRenderer.invoke(
        PRINTER_IPC.connect,
        baudRate,
      ) as Promise<
        PrinterConnectionResult | null
      >;
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
      gcode: ParsedGcode,
    ): Promise<void> {
      return ipcRenderer.invoke(
        PRINTER_IPC.startTestPrint,
        gcode,
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
  });

contextBridge.exposeInMainWorld(
  "desktop",
  desktopApi,
);