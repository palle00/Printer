import {
  app,
  type BrowserWindow,
  type Tray,
} from "electron";
import path from "node:path";

import { PRINTER_IPC } from "../../src/types/printer-ipc";
import { PrintSleepBlocker } from "./power/PrintSleepBlocker";
import { PrinterRuntime } from "./printer/PrinterRuntime";
import { registerPrinterIpc } from "./printer/registerPrinterIpc";
import { createMainWindow as createWindow } from "./window/createMainWindow";
import { createTray as createAppTray } from "./window/createTray";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let printerRuntime: PrinterRuntime | null = null;
let unregisterPrinterIpc: (() => void) | null = null;

const sleepBlocker = new PrintSleepBlocker();

function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "tray-icon.png")
    : path.join(process.cwd(), "resources", "tray-icon.png");
}

function initialisePrinter(): void {
  if (printerRuntime) {
    return;
  }

  printerRuntime = new PrinterRuntime({
    emit: (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(PRINTER_IPC.event, event);
      }
    },
    setPrintingActive: (active) => {
      sleepBlocker.setPrintingActive(active);
    },
  });

  unregisterPrinterIpc = registerPrinterIpc({
    getWindow: () => mainWindow,
    runtime: printerRuntime,
  });
}

function createMainWindow(): void {
  const window = createWindow(getAppIconPath());
  mainWindow = window;
  initialisePrinter();

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  mainWindow.setSkipTaskbar(false);

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);

  void app.whenReady().then(() => {
    if (process.platform === "win32") {
      app.setAppUserModelId("dk.patrick.PrintInterface");
    }

    createMainWindow();
    tray = createAppTray(getAppIconPath(), showMainWindow);
    app.on("activate", showMainWindow);
  });
}

app.on("before-quit", () => {
  unregisterPrinterIpc?.();
  unregisterPrinterIpc = null;

  void printerRuntime?.dispose();
  printerRuntime = null;

  sleepBlocker.dispose();
  tray?.destroy();
  tray = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
