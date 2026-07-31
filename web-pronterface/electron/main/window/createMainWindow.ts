import {
  app,
  BrowserWindow,
  type NativeImage,
  shell,
} from "electron";
import path from "node:path";

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function getWindowTitle(): string {
  return `PrintInterface v${app.getVersion()}`;
}

function openExternalUrl(value: string): void {
  if (isSafeExternalUrl(value)) {
    void shell.openExternal(value);
  }
}

function isDevelopmentNavigationAllowed(
  url: string,
  developmentUrl: string | undefined,
): boolean {
  if (app.isPackaged || !developmentUrl) {
    return false;
  }

  try {
    return new URL(url).origin === new URL(developmentUrl).origin;
  } catch {
    return false;
  }
}

export function createMainWindow(
  icon: NativeImage,
): BrowserWindow {
  const window = new BrowserWindow({
    title: getWindowTitle(),
    icon,
    width: 1500,
    height: 950,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#0b0e14",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.session
    .setPermissionRequestHandler(
      (_webContents, _permission, callback) => {
        callback(false);
      },
    );

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on(
    "page-title-updated",
    (event) => {
      event.preventDefault();
      window.setTitle(
        getWindowTitle(),
      );
    },
  );

  window.on("minimize", () => {
    setTimeout(() => {
      if (!window.isDestroyed()) {
        window.hide();
        window.setSkipTaskbar(true);
      }
    }, 0);
  });

  window.on("show", () => {
    window.setSkipTaskbar(false);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (
      url === window.webContents.getURL() ||
      isDevelopmentNavigationAllowed(
        url,
        process.env["ELECTRON_RENDERER_URL"],
      )
    ) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url);
  });

  const developmentUrl = process.env["ELECTRON_RENDERER_URL"];

  if (!app.isPackaged && developmentUrl) {
    void window.loadURL(developmentUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(
      path.join(__dirname, "../renderer/index.html"),
    );
  }

  return window;
}
