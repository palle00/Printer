import {
  app,
  nativeImage,
  type BrowserWindow,
  type NativeImage,
  type Tray,
} from "electron";
import path from "node:path";

import { PRINTER_IPC } from "../../src/types/printer-ipc";
import {
  registerDesktopIpc,
} from "./ipc/registerDesktopIpc";
import { PrintSleepBlocker } from "./power/PrintSleepBlocker";
import { PrinterRuntime } from "./printer/PrinterRuntime";
import { registerPrinterIpc } from "./printer/registerPrinterIpc";
import { createMainWindow as createWindow } from "./window/createMainWindow";
import { createTray as createAppTray } from "./window/createTray";
import {
  AppSettingsStore,
} from "./settings/AppSettingsStore";
import {
  NotificationService,
} from "./notifications/NotificationService";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let printerRuntime: PrinterRuntime | null = null;
let unregisterPrinterIpc: (() => void) | null = null;
let unregisterDesktopIpc: (() => void) | null = null;
let settingsStore: AppSettingsStore | null = null;
let notificationService:
  NotificationService | null = null;
let appIcon: NativeImage | null =
  null;

const sleepBlocker = new PrintSleepBlocker();

function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "tray-icon.png")
    : path.join(
        app.getAppPath(),
        "resources",
        "tray-icon.png",
      );
}

function getAppIcon(): NativeImage {
  if (appIcon) {
    return appIcon;
  }

  const icon =
    nativeImage.createFromPath(
      getAppIconPath(),
    );

  if (icon.isEmpty()) {
    throw new Error(
      `Unable to load application icon: ${getAppIconPath()}`,
    );
  }

  appIcon = icon;
  return icon;
}

function initialisePrinter(): void {
  if (printerRuntime) {
    return;
  }

  printerRuntime = new PrinterRuntime({
    emit: (event) => {
      notificationService?.handle(
        event,
      );
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

  if (
    settingsStore &&
    !unregisterDesktopIpc
  ) {
    unregisterDesktopIpc =
      registerDesktopIpc({
        getWindow: () =>
          mainWindow,
        settings:
          settingsStore,
      });
  }
}

function createMainWindow(): void {
  const window = createWindow(
    getAppIcon(),
  );
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

  void app.whenReady().then(async () => {
    if (process.platform === "win32") {
      app.setAppUserModelId("dk.patrick.PrintInterface");
    }

    settingsStore =
      new AppSettingsStore(
        path.join(
          app.getPath("userData"),
          "settings.json",
        ),
      );
    await settingsStore.load();
    notificationService =
      new NotificationService({
        getWindow: () =>
          mainWindow,
        showWindow:
          showMainWindow,
        getIcon: getAppIcon,
        settings:
          settingsStore,
      });

    createMainWindow();
    tray = createAppTray(
      getAppIcon(),
      showMainWindow,
    );
    app.on("activate", showMainWindow);
  });
}

app.on("before-quit", () => {
  unregisterDesktopIpc?.();
  unregisterDesktopIpc = null;
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
