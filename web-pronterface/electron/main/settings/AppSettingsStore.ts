import {
  promises as fs,
} from "node:fs";
import path from "node:path";
import type {
  AppSettingsSnapshot,
  NotificationPreferences,
  RecentFileEntry,
} from "../../../src/types/settings";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../../../src/types/settings";

const MAXIMUM_RECENT_FILES = 10;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function parseRecentFiles(
  value: unknown,
): RecentFileEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (
        entry,
      ): entry is RecentFileEntry => {
        if (!isRecord(entry)) {
          return false;
        }

        return (
          typeof entry.path ===
            "string" &&
          path.isAbsolute(
            entry.path,
          ) &&
          typeof entry.name ===
            "string" &&
          entry.name.length > 0 &&
          typeof entry.size ===
            "number" &&
          Number.isFinite(
            entry.size,
          ) &&
          entry.size >= 0 &&
          typeof entry.lastOpenedAt ===
            "number" &&
          Number.isFinite(
            entry.lastOpenedAt,
          )
        );
      },
    )
    .slice(0, MAXIMUM_RECENT_FILES);
}

function parseNotificationPreferences(
  value: unknown,
): NotificationPreferences {
  if (!isRecord(value)) {
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    };
  }

  const defaults =
    DEFAULT_NOTIFICATION_PREFERENCES;
  const read = (
    key: keyof NotificationPreferences,
  ): boolean =>
    typeof value[key] === "boolean"
      ? value[key]
      : defaults[key];

  return {
    enabled: read("enabled"),
    printStarted: read("printStarted"),
    printPaused: read("printPaused"),
    printCompleted: read("printCompleted"),
    printStopped: read("printStopped"),
    printerDisconnected:
      read("printerDisconnected"),
    printerErrors:
      read("printerErrors"),
    temperatureReached:
      read("temperatureReached"),
  };
}

export class AppSettingsStore {
  private snapshot:
    AppSettingsSnapshot = {
      recentFiles: [],
      notifications: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
      },
    };
  private writeChain:
    Promise<void> =
      Promise.resolve();

  constructor(
    private readonly filePath:
      string,
  ) {}

  async load(): Promise<void> {
    try {
      const text =
        await fs.readFile(
          this.filePath,
          "utf8",
        );
      const value: unknown =
        JSON.parse(text);

      if (!isRecord(value)) {
        return;
      }

      this.snapshot = {
        recentFiles:
          parseRecentFiles(
            value.recentFiles,
          ),
        notifications:
          parseNotificationPreferences(
            value.notifications,
          ),
      };
    } catch (error) {
      if (
        !isRecord(error) ||
        error.code !== "ENOENT"
      ) {
        console.error(
          "Unable to load application settings.",
          error,
        );
      }
    }
  }

  getSnapshot():
    AppSettingsSnapshot {
    return {
      recentFiles:
        this.snapshot.recentFiles.map(
          (entry) => ({
            ...entry,
          }),
        ),
      notifications: {
        ...this.snapshot
          .notifications,
      },
    };
  }

  async addRecentFile(
    entry: RecentFileEntry,
  ): Promise<RecentFileEntry[]> {
    const normalizedPath =
      path.normalize(entry.path);
    const remaining =
      this.snapshot.recentFiles
        .filter(
          (item) =>
            path.normalize(
              item.path,
            ).toLowerCase() !==
            normalizedPath.toLowerCase(),
        );

    this.snapshot.recentFiles = [
      {
        ...entry,
        path: normalizedPath,
      },
      ...remaining,
    ].slice(0, MAXIMUM_RECENT_FILES);
    await this.persist();
    return this.getSnapshot()
      .recentFiles;
  }

  async removeRecentFile(
    filePath: string,
  ): Promise<RecentFileEntry[]> {
    const normalized =
      path.normalize(
        filePath,
      ).toLowerCase();
    this.snapshot.recentFiles =
      this.snapshot.recentFiles
        .filter(
          (entry) =>
            path
              .normalize(entry.path)
              .toLowerCase() !==
            normalized,
        );
    await this.persist();
    return this.getSnapshot()
      .recentFiles;
  }

  async clearRecentFiles():
    Promise<RecentFileEntry[]> {
    this.snapshot.recentFiles = [];
    await this.persist();
    return [];
  }

  async updateNotifications(
    update:
      Partial<
        NotificationPreferences
      >,
  ): Promise<NotificationPreferences> {
    this.snapshot.notifications = {
      ...this.snapshot
        .notifications,
      ...update,
    };
    await this.persist();
    return {
      ...this.snapshot
        .notifications,
    };
  }

  private persist(): Promise<void> {
    const snapshot =
      JSON.stringify(
        this.snapshot,
        null,
        2,
      );
    const directory =
      path.dirname(
        this.filePath,
      );
    const temporaryPath =
      `${this.filePath}.tmp`;

    this.writeChain =
      this.writeChain
        .catch(
          () => undefined,
        )
        .then(
        async () => {
          await fs.mkdir(
            directory,
            {
              recursive: true,
            },
          );
          await fs.writeFile(
            temporaryPath,
            snapshot,
            "utf8",
          );
          await fs.rename(
            temporaryPath,
            this.filePath,
          );
        },
      );

    return this.writeChain;
  }
}
