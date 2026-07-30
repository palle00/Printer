import type {
  AppSettingsSnapshot,
  NotificationPreferences,
  RecentFileEntry,
} from "./settings";

export interface GcodeFileData {
  path: string;
  name: string;
  size: number;
  text: string;
}

export const DESKTOP_IPC = {
  chooseGcodeFile:
    "desktop:choose-gcode-file",
  readGcodePath:
    "desktop:read-gcode-path",
  markGcodeOpened:
    "desktop:mark-gcode-opened",
  removeRecentFile:
    "desktop:remove-recent-file",
  clearRecentFiles:
    "desktop:clear-recent-files",
  getSettings:
    "desktop:get-settings",
  updateNotifications:
    "desktop:update-notifications",
} as const;

export interface DesktopFileApi {
  chooseGcodeFile():
    Promise<GcodeFileData | null>;
  readDroppedFile(
    file: File,
  ): Promise<GcodeFileData>;
  openRecentFile(
    path: string,
  ): Promise<GcodeFileData>;
  markOpened(
    path: string,
  ): Promise<RecentFileEntry[]>;
  removeRecent(
    path: string,
  ): Promise<RecentFileEntry[]>;
  clearRecent():
    Promise<RecentFileEntry[]>;
}

export interface DesktopSettingsApi {
  get():
    Promise<AppSettingsSnapshot>;
  updateNotifications(
    preferences:
      Partial<
        NotificationPreferences
      >,
  ): Promise<NotificationPreferences>;
}
