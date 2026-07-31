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
import { promises as fs } from "node:fs";

import { PRINTER_IPC } from "../../src/types/printer-ipc";
import { DESKTOP_IPC } from "../../src/types/desktop-files";
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
import { LocalMonitoringServer } from "./monitoring/LocalMonitoringServer";

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
const monitoringServer = new LocalMonitoringServer();

const WINDOWS_APP_USER_MODEL_ID =
  "dk.patrick.PrintDeck";
const WINDOWS_DEVELOPMENT_APP_USER_MODEL_ID =
  `${WINDOWS_APP_USER_MODEL_ID}.Development`;
const sleepBlocker = new PrintSleepBlocker();

app.setName("PrintDeck");

if (process.platform === "win32") {
  app.setAppUserModelId(
    app.isPackaged
      ? WINDOWS_APP_USER_MODEL_ID
      : WINDOWS_DEVELOPMENT_APP_USER_MODEL_ID,
  );
}

function getAppIconPath(): string {
  const fileName =
    process.platform === "win32"
      ? "app-icon.ico"
      : "app-icon.png";
  return path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(app.getAppPath(), "resources"),
    fileName,
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

async function migrateLegacySettings(): Promise<void> {
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  const legacyPath = path.join(app.getPath("appData"), "PrintInterface", "settings.json");
  try {
    await fs.access(settingsPath);
    return;
  } catch {
    // A fresh PrintDeck install has no settings file yet.
  }
  try {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.copyFile(legacyPath, settingsPath);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      console.error("Unable to migrate legacy PrintInterface settings.", error);
    }
  }
}

function initialisePrinter(): void {
  if (printerRuntime) {
    return;
  }

  printerRuntime = new PrinterRuntime({
    emit: (event) => {
      monitoringServer.update(event);
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
        onOperationsChanged: (operations) => monitoringServer.configure(operations.network),
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
  mainWindow.moveTop();
  mainWindow.focus();
  mainWindow.webContents.focus();
}

function findGcodeArgument(argumentsList: readonly string[]): string | null {
  return argumentsList.find((argument) => path.isAbsolute(argument) && /\.(?:gcode|gco|gc|g)$/i.test(argument)) ?? null;
}

function requestGcodeOpen(filePath: string): void {
  showMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const send = (): void => mainWindow?.webContents.send(DESKTOP_IPC.openGcodeRequested, filePath);
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once("did-finish-load", send);
  else send();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const requestedPath = findGcodeArgument(commandLine);
    if (requestedPath) requestGcodeOpen(requestedPath);
    else showMainWindow();
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    requestGcodeOpen(filePath);
  });

  void app.whenReady().then(async () => {
    await migrateLegacySettings();
    settingsStore =
      new AppSettingsStore(
        path.join(
          app.getPath("userData"),
          "settings.json",
        ),
      );
    await settingsStore.load();
    monitoringServer.configure(settingsStore.getSnapshot().operations.network);
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
    if (process.platform === "win32") {
      Notification.handleActivation(
        showMainWindow,
      );
    }
    const initialFile = findGcodeArgument(process.argv);
    if (initialFile) requestGcodeOpen(initialFile);
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
        "Stop the active print before exiting PrintDeck.",
      detail:
        "PrintDeck must remain open until the printer shutdown sequence has completed.",
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
  monitoringServer.stop();
  tray?.destroy();
  tray = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
