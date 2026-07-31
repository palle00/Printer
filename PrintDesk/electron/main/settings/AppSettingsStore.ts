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
import type { OperationsSettings } from "../../../src/types/operations";
import { DEFAULT_OPERATIONS_SETTINGS } from "../../../src/types/operations";

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

function parseOperations(value: unknown): OperationsSettings {
  if (!isRecord(value)) {
    return structuredClone(DEFAULT_OPERATIONS_SETTINGS);
  }

  const defaults = DEFAULT_OPERATIONS_SETTINGS;
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.filter((profile): profile is OperationsSettings["profiles"][number] =>
        isRecord(profile) && typeof profile.id === "string" && typeof profile.name === "string" &&
        typeof profile.bedWidthMm === "number" && typeof profile.bedDepthMm === "number" &&
        typeof profile.maximumHeightMm === "number" && typeof profile.maximumHotendCelsius === "number" &&
        typeof profile.maximumBedCelsius === "number" && typeof profile.baudRate === "number" &&
        ["marlin", "klipper", "reprap", "generic"].includes(String(profile.firmware)),
      )
    : [];
  const readArray = <K extends "history" | "spools" | "maintenance" | "macros" | "queue">(key: K): OperationsSettings[K] =>
    (Array.isArray(value[key]) ? value[key] : defaults[key]) as OperationsSettings[K];
  const camera = isRecord(value.camera)
    ? { enabled: value.camera.enabled === true, streamUrl: typeof value.camera.streamUrl === "string" ? value.camera.streamUrl : "" }
    : defaults.camera;
  const network = isRecord(value.network)
    ? {
        enabled: value.network.enabled === true,
        port: typeof value.network.port === "number" && value.network.port >= 1024 && value.network.port <= 65535 ? value.network.port : defaults.network.port,
        readOnly: value.network.readOnly !== false,
      }
    : defaults.network;

  const safeProfiles = profiles.length > 0 ? profiles : structuredClone(defaults.profiles);
  const requestedProfile = typeof value.activeProfileId === "string" ? value.activeProfileId : defaults.activeProfileId;
  return {
    profiles: safeProfiles,
    activeProfileId: safeProfiles.some((profile) => profile.id === requestedProfile) ? requestedProfile : safeProfiles[0].id,
    history: readArray("history").slice(0, 250),
    spools: readArray("spools"),
    activeSpoolId: typeof value.activeSpoolId === "string" ? value.activeSpoolId : null,
    maintenance: readArray("maintenance"),
    macros: readArray("macros"),
    queue: readArray("queue"),
    camera,
    network,
    recoveryCheckpoint: isRecord(value.recoveryCheckpoint) && typeof value.recoveryCheckpoint.fileName === "string" && typeof value.recoveryCheckpoint.filePath === "string" && typeof value.recoveryCheckpoint.fileSha256 === "string" && typeof value.recoveryCheckpoint.commandIndex === "number" && typeof value.recoveryCheckpoint.layer === "number" && typeof value.recoveryCheckpoint.totalLayers === "number" && typeof value.recoveryCheckpoint.elapsedSeconds === "number" && typeof value.recoveryCheckpoint.capturedAt === "number" && (value.recoveryCheckpoint.state === "printing" || value.recoveryCheckpoint.state === "interrupted") ? value.recoveryCheckpoint as unknown as OperationsSettings["recoveryCheckpoint"] : null,
    dismissedPrinterIdentities: Array.isArray(value.dismissedPrinterIdentities) ? value.dismissedPrinterIdentities.filter((identity): identity is string => typeof identity === "string").slice(0, 100) : [],
  };
}

export class AppSettingsStore {
  private snapshot:
    AppSettingsSnapshot = {
      recentFiles: [],
      notifications: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
      },
      operations: structuredClone(DEFAULT_OPERATIONS_SETTINGS),
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
        operations: parseOperations(value.operations),
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
      operations: structuredClone(this.snapshot.operations),
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

  async updateOperations(
    operations: OperationsSettings,
  ): Promise<OperationsSettings> {
    this.snapshot.operations = parseOperations(operations);
    await this.persist();
    return structuredClone(this.snapshot.operations);
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
