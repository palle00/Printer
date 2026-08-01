import { promises as fs } from "node:fs";
import path from "node:path";

import { DEFAULT_OPERATIONS_SETTINGS, type OperationsSettings } from "../../../src/types/operations";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type AppSettingsSnapshot,
  type NotificationPreferences,
  type RecentFileEntry,
} from "../../../src/types/settings";
import {
  MAXIMUM_RECENT_FILES,
  parseAppSettingsSnapshot,
  parseOperationsSettings,
} from "./settingsParsing";

export class AppSettingsStore {
  private snapshot: AppSettingsSnapshot = {
    recentFiles: [],
    notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES },
    operations: structuredClone(DEFAULT_OPERATIONS_SETTINGS),
  };
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const parsed = parseAppSettingsSnapshot(
        JSON.parse(await fs.readFile(this.filePath, "utf8")) as unknown,
      );
      if (parsed) this.snapshot = parsed;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        console.error("Unable to load application settings.", error);
      }
    }
  }

  getSnapshot(): AppSettingsSnapshot {
    return structuredClone(this.snapshot);
  }

  async addRecentFile(entry: RecentFileEntry): Promise<RecentFileEntry[]> {
    const normalizedPath = path.normalize(entry.path);
    this.snapshot.recentFiles = [
      { ...entry, path: normalizedPath },
      ...this.snapshot.recentFiles.filter(
        (item) => path.normalize(item.path).toLowerCase() !== normalizedPath.toLowerCase(),
      ),
    ].slice(0, MAXIMUM_RECENT_FILES);
    await this.persist();
    return this.getSnapshot().recentFiles;
  }

  async removeRecentFile(filePath: string): Promise<RecentFileEntry[]> {
    const normalized = path.normalize(filePath).toLowerCase();
    this.snapshot.recentFiles = this.snapshot.recentFiles.filter(
      (entry) => path.normalize(entry.path).toLowerCase() !== normalized,
    );
    await this.persist();
    return this.getSnapshot().recentFiles;
  }

  async clearRecentFiles(): Promise<RecentFileEntry[]> {
    this.snapshot.recentFiles = [];
    await this.persist();
    return [];
  }

  async updateNotifications(update: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    this.snapshot.notifications = { ...this.snapshot.notifications, ...update };
    await this.persist();
    return { ...this.snapshot.notifications };
  }

  async updateOperations(operations: OperationsSettings): Promise<OperationsSettings> {
    this.snapshot.operations = parseOperationsSettings(operations);
    await this.persist();
    return structuredClone(this.snapshot.operations);
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.snapshot, null, 2);
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.tmp`;
    this.writeChain = this.writeChain.catch(() => undefined).then(async () => {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(temporaryPath, snapshot, "utf8");
      await fs.rename(temporaryPath, this.filePath);
    });
    return this.writeChain;
  }
}
