import {
  app,
  dialog,
  nativeImage,
  Notification,
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
import {
  ApplicationUpdater,
} from "./updates/ApplicationUpdater";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let printerRuntime: PrinterRuntime | null = null;
let unregisterPrinterIpc: (() => void) | null = null;
let unregisterDesktopIpc: (() => void) | null = null;
let settingsStore: AppSettingsStore | null = null;
let notificationService:
  NotificationService | null = null;
let applicationUpdater:
  ApplicationUpdater | null = null;
let appIcon: NativeImage | null =
  null;

const WINDOWS_APP_USER_MODEL_ID =
  "dk.patrick.PrintInterface";
const sleepBlocker = new PrintSleepBlocker();

if (process.platform === "win32") {
  app.setAppUserModelId(
    WINDOWS_APP_USER_MODEL_ID,
  );
}

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
      applicationUpdater
        ?.setPrintActive(
          active,
        );
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

  window.on("close", (event) => {
    if (
      printerRuntime
        ?.isPrintActive
    ) {
      event.preventDefault();
      window.hide();
      window.setSkipTaskbar(true);
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
      Notification.handleActivation(
        showMainWindow,
      );
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
    applicationUpdater =
      new ApplicationUpdater({
        getWindow: () =>
          mainWindow,
        showWindow:
          showMainWindow,
      });

    createMainWindow();
    tray = createAppTray(
      getAppIcon(),
      showMainWindow,
    );
    applicationUpdater.start();
    app.on("activate", showMainWindow);
  });
}

app.on("before-quit", (event) => {
  if (
    printerRuntime?.isPrintActive
  ) {
    event.preventDefault();
    showMainWindow();
    void dialog.showMessageBox({
      type: "warning",
      title: "Print in progress",
      message:
        "Stop the active print before exiting PrintInterface.",
      detail:
        "PrintInterface must remain open until the printer shutdown sequence has completed.",
      buttons: [
        "OK",
      ],
    });
    return;
  }

  applicationUpdater?.dispose();
  applicationUpdater = null;
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
