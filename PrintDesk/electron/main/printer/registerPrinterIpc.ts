import {
  app,
  ipcMain,
  type BrowserWindow,
} from "electron";
import path from "node:path";

import {
  PRINTER_IPC,
  type PrinterConnectionResult,
} from "../../../src/types/printer-ipc";
import type { PrinterRuntime } from "./PrinterRuntime";
import {
  assertBaudRate,
  assertRealPrintPayload,
  assertSerialPortPath,
  assertTestPrintPayload,
} from "./printerIpcValidation";
import {
  assertTrustedSender,
} from "../ipc/assertTrustedSender";
import {
  VerifiedGcodeCommandSource,
} from "../files/VerifiedGcodeCommandSource";

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
    PRINTER_IPC.emergencyStop,
    PRINTER_IPC.resetPrint,
    PRINTER_IPC.cancelObject,
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
      requestedPath: unknown,
      requestedBaudRate: unknown,
    ): Promise<PrinterConnectionResult> => {
      assertTrustedSender(event, getWindow());
      const path = assertSerialPortPath(requestedPath);
      const baudRate = assertBaudRate(requestedBaudRate);
      const availablePorts = await runtime.listPorts();

      if (!availablePorts.some((port) => port.path === path)) {
        throw new Error(
          `${path} is no longer available. Refresh the port list and try again.`,
        );
      }

      const selectedPort = availablePorts.find((port) => port.path === path)!;
      const detectedPrinter = await runtime.connect(path, baudRate, selectedPort.serialNumber ?? null);

      return {
        path,
        baudRate,
        detectedPrinter,
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
    async (
      event,
      value: unknown,
    ) => {
      assertTrustedSender(event, getWindow());
      assertRealPrintPayload(value);
      const commandSource =
        await VerifiedGcodeCommandSource
          .open(
            value.source,
            value.commandLayers
              .length,
            path.join(
              app.getPath("temp"),
              "PrintDeck",
              "print-spool",
            ),
          );

      try {
        runtime.startPrint({
          fileName: path.basename(
            value.source.path,
          ),
          commandSource,
          commandLayers:
            value.commandLayers,
          totalLayers:
            value.totalLayers,
          timing: value.timing,
        });
      } catch (error) {
        await commandSource.close();
        throw error;
      }
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

  ipcMain.handle(PRINTER_IPC.emergencyStop, async (event) => {
    assertTrustedSender(event, getWindow());
    await runtime.emergencyStop();
  });

  ipcMain.handle(PRINTER_IPC.resetPrint, (event) => {
    assertTrustedSender(event, getWindow());
    runtime.resetPrint();
  });

  ipcMain.handle(PRINTER_IPC.cancelObject, async (event, protocol: unknown, objectId: unknown) => {
    assertTrustedSender(event, getWindow());
    if (protocol !== "marlin-m486" && protocol !== "klipper") throw new Error("Unsupported object-cancellation protocol.");
    if (typeof objectId !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(objectId)) throw new Error("Invalid object identifier.");
    await runtime.cancelObject(protocol, objectId);
  });

  return () => {
    for (const channel of channels) {
      ipcMain.removeHandler(channel);
    }
  };
}
