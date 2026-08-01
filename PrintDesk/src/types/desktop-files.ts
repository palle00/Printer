import type {
  AppSettingsSnapshot,
  NotificationPreferences,
  RecentFileEntry,
} from "./settings";
import type { OperationsSettings } from "./operations";
import type {
  GcodeFileFingerprint,
} from "./gcode-file";

export interface GcodeFileData
  extends GcodeFileFingerprint {
  name: string;
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
  updateOperations:
    "desktop:update-operations",
  exportDiagnostics:
    "desktop:export-diagnostics",
  exportFailureReport:
    "desktop:export-failure-report",
  openGcodeRequested:
    "desktop:open-gcode-requested",
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
  onOpenRequested(
    listener: (path: string) => void,
  ): () => void;
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
  updateOperations(
    operations: OperationsSettings,
  ): Promise<OperationsSettings>;
  exportDiagnostics(): Promise<string | null>;
  exportFailureReport(reportId: string): Promise<string | null>;
}
