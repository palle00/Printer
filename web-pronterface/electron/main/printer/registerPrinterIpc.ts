import {
  ipcMain,
  type BrowserWindow,
} from "electron";

import {
  PRINTER_IPC,
  type PrinterConnectionResult,
} from "../../../src/types/printer-ipc";
import type { PrinterRuntime } from "./PrinterRuntime";
import { choosePrinterPort } from "./choosePrinterPort";
import {
  assertBaudRate,
  assertRealPrintPayload,
  assertTestPrintPayload,
} from "./printerIpcValidation";
import {
  assertTrustedSender,
} from "../ipc/assertTrustedSender";

interface RegisterPrinterIpcOptions {
  getWindow(): BrowserWindow | null;
  runtime: PrinterRuntime;
}

export function registerPrinterIpc({
  getWindow,
  runtime,
}: RegisterPrinterIpcOptions): () => void {
  const channels = [
    PRINTER_IPC.listPorts,
    PRINTER_IPC.connect,
    PRINTER_IPC.disconnect,
    PRINTER_IPC.sendGcode,
    PRINTER_IPC.startPrint,
    PRINTER_IPC.startTestPrint,
    PRINTER_IPC.pausePrint,
    PRINTER_IPC.resumePrint,
    PRINTER_IPC.stopPrint,
    PRINTER_IPC.resetPrint,
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(PRINTER_IPC.listPorts, (event) => {
    assertTrustedSender(event, getWindow());
    return runtime.listPorts();
  });

  ipcMain.handle(
    PRINTER_IPC.connect,
    async (
      event,
      requestedBaudRate: unknown,
    ): Promise<PrinterConnectionResult | null> => {
      const window = assertTrustedSender(event, getWindow());
      const baudRate = assertBaudRate(requestedBaudRate);
      const selectedPort = await choosePrinterPort(
        window,
        await runtime.listPorts(),
      );

      if (!selectedPort) {
        return null;
      }

      await runtime.connect(selectedPort.path, baudRate);

      return {
        path: selectedPort.path,
        baudRate,
      };
    },
  );

  ipcMain.handle(PRINTER_IPC.disconnect, async (event) => {
    assertTrustedSender(event, getWindow());
    await runtime.disconnect();
  });

  ipcMain.handle(
    PRINTER_IPC.sendGcode,
    async (event, value: unknown) => {
      assertTrustedSender(event, getWindow());

      if (typeof value !== "string") {
        throw new Error("G-code must be a string.");
      }

      await runtime.sendGcode(value);
    },
  );

  ipcMain.handle(
    PRINTER_IPC.startPrint,
    (event, value: unknown) => {
      assertTrustedSender(event, getWindow());
      assertRealPrintPayload(value);
      runtime.startPrint(value);
    },
  );

  ipcMain.handle(
    PRINTER_IPC.startTestPrint,
    (event, value: unknown) => {
      assertTrustedSender(event, getWindow());
      assertTestPrintPayload(value);
      runtime.startTestPrint(value);
    },
  );

  ipcMain.handle(PRINTER_IPC.pausePrint, (event) => {
    assertTrustedSender(event, getWindow());
    runtime.pausePrint();
  });

  ipcMain.handle(PRINTER_IPC.resumePrint, (event) => {
    assertTrustedSender(event, getWindow());
    runtime.resumePrint();
  });

  ipcMain.handle(PRINTER_IPC.stopPrint, (event) => {
    assertTrustedSender(event, getWindow());
    runtime.stopPrint();
  });

  ipcMain.handle(PRINTER_IPC.resetPrint, (event) => {
    assertTrustedSender(event, getWindow());
    runtime.resetPrint();
  });

  return () => {
    for (const channel of channels) {
      ipcMain.removeHandler(channel);
    }
  };
}
