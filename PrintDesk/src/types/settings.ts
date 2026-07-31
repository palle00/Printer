export interface RecentFileEntry {
  path: string;
  name: string;
  size: number;
  lastOpenedAt: number;
}

export interface NotificationPreferences {
  enabled: boolean;
  printStarted: boolean;
  printPaused: boolean;
  printCompleted: boolean;
  printStopped: boolean;
  printerDisconnected: boolean;
  printerErrors: boolean;
  temperatureReached: boolean;
}

export interface AppSettingsSnapshot {
  recentFiles: RecentFileEntry[];
  notifications:
    NotificationPreferences;
  operations: OperationsSettings;
}

export const DEFAULT_NOTIFICATION_PREFERENCES:
  NotificationPreferences = {
    enabled: true,
    printStarted: true,
    printPaused: true,
    printCompleted: true,
    printStopped: true,
    printerDisconnected: true,
    printerErrors: true,
    temperatureReached: false,
  };
import type { OperationsSettings } from "./operations";
