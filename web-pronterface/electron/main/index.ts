import {
  app,
  BrowserWindow,
  Menu,
  shell,
  Tray,
} from "electron";

import path from "node:path";

import {
  PRINTER_IPC,
} from "../../src/types/printer-ipc";

import {
  PrintSleepBlocker,
} from "./power/PrintSleepBlocker";

import {
  PrinterRuntime,
} from "./printer/PrinterRuntime";

import {
  registerPrinterIpc,
} from "./printer/registerPrinterIpc";

let mainWindow:
  BrowserWindow | null = null;

let tray:
  Tray | null = null;

let printerRuntime:
  PrinterRuntime | null = null;

let unregisterPrinterIpc:
  (() => void) | null = null;

const sleepBlocker =
  new PrintSleepBlocker();

function isSafeExternalUrl(
  value: string,
): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}

function openExternalUrl(
  value: string,
): void {
  if (!isSafeExternalUrl(value)) {
    return;
  }

  void shell.openExternal(
    value,
  );
}

function getTrayIconPath():
  string {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "tray-icon.png",
    );
  }

  return path.join(
    process.cwd(),
    "resources",
    "tray-icon.png",
  );
}

function initialisePrinter():
  void {
  if (printerRuntime) {
    return;
  }

  printerRuntime =
    new PrinterRuntime({
      emit: (event) => {
        const window =
          mainWindow;

        if (
          !window ||
          window.isDestroyed()
        ) {
          return;
        }

        window.webContents.send(
          PRINTER_IPC.event,
          event,
        );
      },

      setPrintingActive:
        (active) => {
          sleepBlocker
            .setPrintingActive(
              active,
            );
        },
    });

  unregisterPrinterIpc =
    registerPrinterIpc({
      getWindow: () =>
        mainWindow,

      runtime:
        printerRuntime,
    });
}

function showMainWindow():
  void {
  if (
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    createMainWindow();
    return;
  }

  mainWindow
    .setSkipTaskbar(false);

  if (
    mainWindow.isMinimized()
  ) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  if (tray) {
    return;
  }

  tray = new Tray(
    getTrayIconPath(),
  );

  tray.setToolTip(
    "Web Pronterface",
  );

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label:
          "Open Web Pronterface",

        click: () => {
          showMainWindow();
        },
      },

      {
        type: "separator",
      },

      {
        label: "Quit",

        click: () => {
          app.quit();
        },
      },
    ]),
  );

  tray.on(
    "click",
    showMainWindow,
  );

  tray.on(
    "double-click",
    showMainWindow,
  );
}

function createMainWindow():
  void {
  const window =
    new BrowserWindow({
      title:
        "Web Pronterface",

      width: 1500,
      height: 950,

      minWidth: 1050,
      minHeight: 700,

      backgroundColor:
        "#0b0e14",

      show: false,

      autoHideMenuBar: true,

      webPreferences: {
        preload: path.join(
          __dirname,
          "../preload/index.js",
        ),

        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,

        backgroundThrottling:
          false,
      },
    });

  mainWindow = window;

  initialisePrinter();

  window.once(
    "ready-to-show",
    () => {
      window.show();
    },
  );

  window.on(
    "minimize",
    () => {
      setTimeout(() => {
        if (
          window.isDestroyed()
        ) {
          return;
        }

        window.hide();

        window
          .setSkipTaskbar(
            true,
          );
      }, 0);
    },
  );

  window.on(
    "show",
    () => {
      window.setSkipTaskbar(
        false,
      );
    },
  );

  window.webContents
    .setWindowOpenHandler(
      ({ url }) => {
        openExternalUrl(url);

        return {
          action: "deny",
        };
      },
    );

  window.webContents.on(
    "will-navigate",
    (event, url) => {
      const currentUrl =
        window.webContents
          .getURL();

      if (url === currentUrl) {
        return;
      }

      const developmentUrl =
        process.env[
          "ELECTRON_RENDERER_URL"
        ];

      if (
        !app.isPackaged &&
        developmentUrl
      ) {
        try {
          if (
            new URL(url).origin ===
            new URL(
              developmentUrl,
            ).origin
          ) {
            return;
          }
        } catch {
          // Reject malformed URLs.
        }
      }

      event.preventDefault();

      openExternalUrl(url);
    },
  );

  const developmentUrl =
    process.env[
      "ELECTRON_RENDERER_URL"
    ];

  if (
    !app.isPackaged &&
    developmentUrl
  ) {
    void window.loadURL(
      developmentUrl,
    );

    window.webContents
      .openDevTools({
        mode: "detach",
      });
  } else {
    void window.loadFile(
      path.join(
        __dirname,
        "../renderer/index.html",
      ),
    );
  }

  window.on(
    "closed",
    () => {
      if (
        mainWindow === window
      ) {
        mainWindow = null;
      }
    },
  );
}

const hasSingleInstanceLock =
  app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on(
    "second-instance",
    showMainWindow,
  );

  void app.whenReady().then(
    () => {
      if (
        process.platform ===
        "win32"
      ) {
        app.setAppUserModelId(
          "dk.patrick.webpronterface",
        );
      }

      createMainWindow();
      createTray();

      app.on(
        "activate",
        showMainWindow,
      );
    },
  );
}

app.on(
  "before-quit",
  () => {
    unregisterPrinterIpc?.();

    unregisterPrinterIpc =
      null;

    void printerRuntime
      ?.dispose();

    printerRuntime = null;

    sleepBlocker.dispose();

    tray?.destroy();
    tray = null;
  },
);

app.on(
  "window-all-closed",
  () => {
    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  },
);