import {
  ipcMain,
  type BrowserWindow,
} from "electron";

import {
  DESKTOP_IPC,
} from "../../../src/types/desktop-files";
import type {
  NotificationPreferences,
} from "../../../src/types/settings";
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
