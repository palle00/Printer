import {
    app,
    BrowserWindow,
    dialog,
    Menu,
    session,
    shell,
    Tray,
} from "electron";

import path from "node:path";

interface ElectronSerialPortInfo {
    portId: string;
    portName: string;
    displayName?: string;
    vendorId?: string;
    productId?: string;
    serialNumber?: string;
    deviceInstanceId?: string;
}

let mainWindow: BrowserWindow | null =
    null;

let tray: Tray | null = null;

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
    url: string,
): void {
    if (!isSafeExternalUrl(url)) {
        return;
    }

    void shell.openExternal(url);
}

function isTrustedRendererOrigin(
    origin: string,
): boolean {
    /*
     * Production renderer:
     * file:///.../index.html
     */
    if (app.isPackaged) {
        return origin.startsWith(
            "file://",
        );
    }

    /*
     * Development renderer:
     * normally http://localhost:5173
     */
    const developmentUrl =
        process.env[
        "ELECTRON_RENDERER_URL"
        ];

    if (developmentUrl) {
        try {
            return (
                new URL(origin).origin ===
                new URL(
                    developmentUrl,
                ).origin
            );
        } catch {
            return false;
        }
    }

    return (
        origin.startsWith(
            "http://localhost:",
        ) ||
        origin.startsWith(
            "http://127.0.0.1:",
        )
    );
}

function formatSerialPort(
    port: ElectronSerialPortInfo,
): string {
    const name =
        port.displayName?.trim() ||
        port.portName ||
        "Serial device";

    const portName =
        port.portName &&
            port.portName !== name
            ? ` — ${port.portName}`
            : "";

    const identifiers = [
        port.vendorId
            ? `VID ${port.vendorId}`
            : null,

        port.productId
            ? `PID ${port.productId}`
            : null,
    ].filter(
        (
            value,
        ): value is string =>
            value !== null,
    );

    const identifierText =
        identifiers.length > 0
            ? ` (${identifiers.join(
                " · ",
            )})`
            : "";

    return `${name}${portName}${identifierText}`;
}

async function selectSerialPort(
    owner: BrowserWindow | null,
    portList:
        ElectronSerialPortInfo[],
): Promise<string> {
    if (portList.length === 0) {
        const options = {
            type: "warning" as const,

            title:
                "No serial devices found",

            message:
                "No serial devices were detected.",

            detail:
                "Connect the printer with USB, make sure its driver is installed, and try again.",

            buttons: ["OK"],

            defaultId: 0,
            cancelId: 0,
            noLink: true,
        };

        if (owner) {
            await dialog.showMessageBox(
                owner,
                options,
            );
        } else {
            await dialog.showMessageBox(
                options,
            );
        }

        return "";
    }

    const portButtons =
        portList.map(
            formatSerialPort,
        );

    const cancelIndex =
        portButtons.length;

    const options = {
        type: "question" as const,

        title:
            "Select printer port",

        message:
            "Choose the serial port used by your 3D printer.",

        detail:
            "The printer normally appears as a COM port on Windows.",

        buttons: [
            ...portButtons,
            "Cancel",
        ],

        defaultId: 0,
        cancelId: cancelIndex,

        noLink: true,
    };

    const result = owner
        ? await dialog.showMessageBox(
            owner,
            options,
        )
        : await dialog.showMessageBox(
            options,
        );

    const selectedPort =
        portList[result.response];

    return (
        selectedPort?.portId ?? ""
    );
}

function configureWebSerial():
    void {
    const applicationSession =
        session.defaultSession;

    /*
     * Allow Web Serial only for our own
     * Electron renderer.
     */
    applicationSession
        .setPermissionCheckHandler(
            (
                _webContents,
                permission,
                requestingOrigin,
                details,
            ) => {
                if (
                    permission !== "serial"
                ) {
                    return false;
                }

                const origin =
                    details.securityOrigin ||
                    requestingOrigin;

                return isTrustedRendererOrigin(
                    origin,
                );
            },
        );

    /*
     * Allow the selected serial device
     * to be used by the renderer.
     */
    applicationSession
        .setDevicePermissionHandler(
            (details) => {
                if (
                    details.deviceType !==
                    "serial"
                ) {
                    return false;
                }

                return isTrustedRendererOrigin(
                    details.origin,
                );
            },
        );

    /*
     * Electron does not provide Chrome's
     * serial chooser. We create our own
     * native popup here.
     */
    applicationSession.on(
        "select-serial-port",

        async (
            event,
            portList,
            requestingWebContents,
            callback,
        ) => {
            event.preventDefault();

            const owner =
                BrowserWindow.fromWebContents(
                    requestingWebContents,
                );

            /*
             * Reject requests coming from an
             * unknown BrowserWindow.
             */
            if (
                !owner ||
                owner !== mainWindow
            ) {
                callback("");
                return;
            }

            try {
                const selectedPortId =
                    await selectSerialPort(
                        owner,

                        portList as
                        ElectronSerialPortInfo[],
                    );

                callback(selectedPortId);
            } catch (error) {
                console.error(
                    "Serial-port selection failed:",
                    error,
                );

                /*
                 * An empty ID cancels requestPort().
                 */
                callback("");
            }
        },
    );
}

function getTrayIconPath(): string {
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

function showMainWindow(): void {
    if (
        !mainWindow ||
        mainWindow.isDestroyed()
    ) {
        createMainWindow();
        return;
    }

    /*
     * Add the window back to the Windows taskbar.
     */
    mainWindow.setSkipTaskbar(false);

    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
}

function createTray(): void {
    if (tray) {
        return;
    }

    const iconPath =
        getTrayIconPath();

    tray = new Tray(iconPath);

    tray.setToolTip(
        "Web Pronterface",
    );

    const menu =
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
        ]);

    tray.setContextMenu(menu);

    /*
     * Clicking the tray icon restores
     * the application.
     */
    tray.on(
        "click",
        () => {
            showMainWindow();
        },
    );

    tray.on(
        "double-click",
        () => {
            showMainWindow();
        },
    );
}

function createMainWindow(): void {
    const window =
        new BrowserWindow({
            title:
                "PrintInterface",

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
                backgroundThrottling: false,
            },
        });

    mainWindow = window;

    window.on(
        "minimize",
        () => {
            /*
             * Wait until Windows has completed the
             * normal minimize operation, then hide it.
             */
            setTimeout(() => {
                if (window.isDestroyed()) {
                    return;
                }

                window.hide();
                window.setSkipTaskbar(true);
            }, 0);
        },
    );

    window.on(
        "show",
        () => {
            window.setSkipTaskbar(false);
        },
    );

    window.once(
        "ready-to-show",
        () => {
            window.show();

            if (!app.isPackaged) {
                window.focus();
            }
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
                window.webContents.getURL();

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
        () => {
            showMainWindow();
        },
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

            /*
             * Configure this once before creating
             * the renderer window.
             */
            configureWebSerial();

            createMainWindow();
            createTray();

            app.on(
                "activate",
                () => {
                    if (
                        BrowserWindow
                            .getAllWindows()
                            .length === 0
                    ) {
                        createMainWindow();
                    }
                },
            );
        },
    );
}

app.on(
  "before-quit",
  () => {
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