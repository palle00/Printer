import {
  app,
  dialog,
  ipcMain,
  type BrowserWindow,
} from "electron";
import { promises as fs } from "node:fs";

import {
  DESKTOP_IPC,
} from "../../../src/types/desktop-files";
import type {
  NotificationPreferences,
} from "../../../src/types/settings";
import type { OperationsSettings } from "../../../src/types/operations";
import {
  chooseGcodeFile,
  inspectGcodeFile,
  readGcodeFile,
} from "../files/gcodeFiles";
import type {
  AppSettingsStore,
} from "../settings/AppSettingsStore";
import {
  assertTrustedSender,
} from "./assertTrustedSender";

interface RegisterDesktopIpcOptions {
  getWindow(): BrowserWindow | null;
  settings: AppSettingsStore;
  onOperationsChanged?(operations: OperationsSettings): void;
}

const NOTIFICATION_KEYS:
  ReadonlySet<
    keyof NotificationPreferences
  > = new Set([
    "enabled",
    "printStarted",
    "printPaused",
    "printCompleted",
    "printStopped",
    "printerDisconnected",
    "printerErrors",
    "temperatureReached",
  ]);

function assertNotificationUpdate(
  value: unknown,
): Partial<NotificationPreferences> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Invalid notification settings.",
    );
  }

  const update:
    Partial<NotificationPreferences> = {};

  for (
    const [
      key,
      setting,
    ] of Object.entries(value)
  ) {
    if (
      !NOTIFICATION_KEYS.has(
        key as keyof NotificationPreferences,
      ) ||
      typeof setting !== "boolean"
    ) {
      throw new Error(
        "Invalid notification settings.",
      );
    }

    update[
      key as keyof NotificationPreferences
    ] = setting;
  }

  return update;
}

export function registerDesktopIpc({
  getWindow,
  settings,
  onOperationsChanged,
}: RegisterDesktopIpcOptions): () => void {
  const channels =
    Object.values(DESKTOP_IPC);

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(
    DESKTOP_IPC.chooseGcodeFile,
    (event) => {
      const window =
        assertTrustedSender(
          event,
          getWindow(),
        );
      return chooseGcodeFile(window);
    },
  );

  ipcMain.handle(DESKTOP_IPC.updateOperations, (event, value: unknown) => {
    assertTrustedSender(event, getWindow());
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid operations settings.");
    }
    return settings.updateOperations(value as OperationsSettings).then((operations) => { onOperationsChanged?.(operations); return operations; });
  });

  ipcMain.handle(DESKTOP_IPC.exportDiagnostics, async (event) => {
    const window = assertTrustedSender(event, getWindow());
    const result = await dialog.showSaveDialog(window, {
      title: "Export diagnostics",
      defaultPath: `PrintDeck-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    const snapshot = settings.getSnapshot();
    const report = {
      generatedAt: new Date().toISOString(),
      application: { name: app.getName(), version: app.getVersion(), packaged: app.isPackaged },
      platform: { platform: process.platform, arch: process.arch, versions: process.versions },
      configuration: {
        notifications: snapshot.notifications,
        profiles: snapshot.operations.profiles.map(({ preferredPort: _port, usbSerialNumber: _serial, ...profile }) => profile),
        cameraEnabled: snapshot.operations.camera.enabled,
        network: snapshot.operations.network,
      },
      recentPrints: snapshot.operations.history.slice(0, 25),
    };
    await fs.writeFile(result.filePath, JSON.stringify(report, null, 2), "utf8");
    return result.filePath;
  });

  ipcMain.handle(
    DESKTOP_IPC.readGcodePath,
    (event, filePath: unknown) => {
      assertTrustedSender(
        event,
        getWindow(),
      );
      return readGcodeFile(filePath);
    },
  );

  ipcMain.handle(
    DESKTOP_IPC.markGcodeOpened,
    async (
      event,
      filePath: unknown,
    ) => {
      assertTrustedSender(
        event,
        getWindow(),
      );
      const entry =
        await inspectGcodeFile(
          filePath,
        );
      return settings.addRecentFile(
        entry,
      );
    },
  );

  ipcMain.handle(
    DESKTOP_IPC.removeRecentFile,
    (event, filePath: unknown) => {
      assertTrustedSender(
        event,
        getWindow(),
      );

      if (
        typeof filePath !== "string"
      ) {
        throw new Error(
          "Invalid recent file path.",
        );
      }

      return settings.removeRecentFile(
        filePath,
      );
    },
  );

  ipcMain.handle(
    DESKTOP_IPC.clearRecentFiles,
    (event) => {
      assertTrustedSender(
        event,
        getWindow(),
      );
      return settings.clearRecentFiles();
    },
  );

  ipcMain.handle(
    DESKTOP_IPC.getSettings,
    (event) => {
      assertTrustedSender(
        event,
        getWindow(),
      );
      return settings.getSnapshot();
    },
  );

  ipcMain.handle(
    DESKTOP_IPC.updateNotifications,
    (
      event,
      value: unknown,
    ) => {
      assertTrustedSender(
        event,
        getWindow(),
      );
      return settings.updateNotifications(
        assertNotificationUpdate(
          value,
        ),
      );
    },
  );

  return () => {
    for (const channel of channels) {
      ipcMain.removeHandler(channel);
    }
  };
}
