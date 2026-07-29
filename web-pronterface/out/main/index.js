"use strict";
const electron = require("electron");
const path = require("node:path");
let mainWindow = null;
let tray = null;
function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
function openExternalUrl(url) {
  if (!isSafeExternalUrl(url)) {
    return;
  }
  void electron.shell.openExternal(url);
}
function isTrustedRendererOrigin(origin) {
  if (electron.app.isPackaged) {
    return origin.startsWith(
      "file://"
    );
  }
  const developmentUrl = process.env["ELECTRON_RENDERER_URL"];
  if (developmentUrl) {
    try {
      return new URL(origin).origin === new URL(
        developmentUrl
      ).origin;
    } catch {
      return false;
    }
  }
  return origin.startsWith(
    "http://localhost:"
  ) || origin.startsWith(
    "http://127.0.0.1:"
  );
}
function formatSerialPort(port) {
  const name = port.displayName?.trim() || port.portName || "Serial device";
  const portName = port.portName && port.portName !== name ? ` — ${port.portName}` : "";
  const identifiers = [
    port.vendorId ? `VID ${port.vendorId}` : null,
    port.productId ? `PID ${port.productId}` : null
  ].filter(
    (value) => value !== null
  );
  const identifierText = identifiers.length > 0 ? ` (${identifiers.join(
    " · "
  )})` : "";
  return `${name}${portName}${identifierText}`;
}
async function selectSerialPort(owner, portList) {
  if (portList.length === 0) {
    const options2 = {
      type: "warning",
      title: "No serial devices found",
      message: "No serial devices were detected.",
      detail: "Connect the printer with USB, make sure its driver is installed, and try again.",
      buttons: ["OK"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    };
    if (owner) {
      await electron.dialog.showMessageBox(
        owner,
        options2
      );
    } else {
      await electron.dialog.showMessageBox(
        options2
      );
    }
    return "";
  }
  const portButtons = portList.map(
    formatSerialPort
  );
  const cancelIndex = portButtons.length;
  const options = {
    type: "question",
    title: "Select printer port",
    message: "Choose the serial port used by your 3D printer.",
    detail: "The printer normally appears as a COM port on Windows.",
    buttons: [
      ...portButtons,
      "Cancel"
    ],
    defaultId: 0,
    cancelId: cancelIndex,
    noLink: true
  };
  const result = owner ? await electron.dialog.showMessageBox(
    owner,
    options
  ) : await electron.dialog.showMessageBox(
    options
  );
  const selectedPort = portList[result.response];
  return selectedPort?.portId ?? "";
}
function configureWebSerial() {
  const applicationSession = electron.session.defaultSession;
  applicationSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) => {
      if (permission !== "serial") {
        return false;
      }
      const origin = details.securityOrigin || requestingOrigin;
      return isTrustedRendererOrigin(
        origin
      );
    }
  );
  applicationSession.setDevicePermissionHandler(
    (details) => {
      if (details.deviceType !== "serial") {
        return false;
      }
      return isTrustedRendererOrigin(
        details.origin
      );
    }
  );
  applicationSession.on(
    "select-serial-port",
    async (event, portList, requestingWebContents, callback) => {
      event.preventDefault();
      const owner = electron.BrowserWindow.fromWebContents(
        requestingWebContents
      );
      if (!owner || owner !== mainWindow) {
        callback("");
        return;
      }
      try {
        const selectedPortId = await selectSerialPort(
          owner,
          portList
        );
        callback(selectedPortId);
      } catch (error) {
        console.error(
          "Serial-port selection failed:",
          error
        );
        callback("");
      }
    }
  );
}
function getTrayIconPath() {
  if (electron.app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "tray-icon.png"
    );
  }
  return path.join(
    process.cwd(),
    "resources",
    "tray-icon.png"
  );
}
function showMainWindow() {
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
function createTray() {
  if (tray) {
    return;
  }
  const iconPath = getTrayIconPath();
  tray = new electron.Tray(iconPath);
  tray.setToolTip(
    "Web Pronterface"
  );
  const menu = electron.Menu.buildFromTemplate([
    {
      label: "Open Web Pronterface",
      click: () => {
        showMainWindow();
      }
    },
    {
      type: "separator"
    },
    {
      label: "Quit",
      click: () => {
        electron.app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on(
    "click",
    () => {
      showMainWindow();
    }
  );
  tray.on(
    "double-click",
    () => {
      showMainWindow();
    }
  );
}
function createMainWindow() {
  const window = new electron.BrowserWindow({
    title: "PrintInterface",
    width: 1500,
    height: 950,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#0b0e14",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(
        __dirname,
        "../preload/index.js"
      ),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false
    }
  });
  mainWindow = window;
  window.on(
    "minimize",
    () => {
      setTimeout(() => {
        if (window.isDestroyed()) {
          return;
        }
        window.hide();
        window.setSkipTaskbar(true);
      }, 0);
    }
  );
  window.on(
    "show",
    () => {
      window.setSkipTaskbar(false);
    }
  );
  window.once(
    "ready-to-show",
    () => {
      window.show();
      if (!electron.app.isPackaged) {
        window.focus();
      }
    }
  );
  window.webContents.setWindowOpenHandler(
    ({ url }) => {
      openExternalUrl(url);
      return {
        action: "deny"
      };
    }
  );
  window.webContents.on(
    "will-navigate",
    (event, url) => {
      const currentUrl = window.webContents.getURL();
      if (url === currentUrl) {
        return;
      }
      const developmentUrl2 = process.env["ELECTRON_RENDERER_URL"];
      if (!electron.app.isPackaged && developmentUrl2) {
        try {
          if (new URL(url).origin === new URL(
            developmentUrl2
          ).origin) {
            return;
          }
        } catch {
        }
      }
      event.preventDefault();
      openExternalUrl(url);
    }
  );
  const developmentUrl = process.env["ELECTRON_RENDERER_URL"];
  if (!electron.app.isPackaged && developmentUrl) {
    void window.loadURL(
      developmentUrl
    );
    window.webContents.openDevTools({
      mode: "detach"
    });
  } else {
    void window.loadFile(
      path.join(
        __dirname,
        "../renderer/index.html"
      )
    );
  }
  window.on(
    "closed",
    () => {
      if (mainWindow === window) {
        mainWindow = null;
      }
    }
  );
}
const hasSingleInstanceLock = electron.app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  electron.app.quit();
} else {
  electron.app.on(
    "second-instance",
    () => {
      showMainWindow();
    }
  );
  void electron.app.whenReady().then(
    () => {
      if (process.platform === "win32") {
        electron.app.setAppUserModelId(
          "dk.patrick.webpronterface"
        );
      }
      configureWebSerial();
      createMainWindow();
      createTray();
      electron.app.on(
        "activate",
        () => {
          if (electron.BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
          }
        }
      );
    }
  );
}
electron.app.on(
  "before-quit",
  () => {
    tray?.destroy();
    tray = null;
  }
);
electron.app.on(
  "window-all-closed",
  () => {
    if (process.platform !== "darwin") {
      electron.app.quit();
    }
  }
);
