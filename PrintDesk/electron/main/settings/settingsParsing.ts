import path from "node:path";

import {
  DEFAULT_OPERATIONS_SETTINGS,
  type FilamentSpool,
  type GcodeMacro,
  type MaintenanceTask,
  type OperationsSettings,
  type PrinterProfile,
  type PrintHistoryEntry,
  type PrintFailureReport,
  type QueuedPrint,
  type RecoveryCheckpoint,
} from "../../../src/types/operations";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type AppSettingsSnapshot,
  type NotificationPreferences,
  type RecentFileEntry,
} from "../../../src/types/settings";

const MAXIMUM_RECENT_FILES = 10;
const MAXIMUM_HISTORY_ENTRIES = 250;
const MAXIMUM_DISMISSED_IDENTITIES = 100;
const FIRMWARE_DIALECTS = new Set(["marlin", "klipper", "reprap", "generic"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function filterRecords<T>(value: unknown, parse: (record: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const parsed = parse(entry);
    return parsed ? [parsed] : [];
  });
}

function parseRecentFile(value: Record<string, unknown>): RecentFileEntry | null {
  return isString(value.path) && path.isAbsolute(value.path) &&
    isString(value.name) && value.name.length > 0 &&
    isFiniteNumber(value.size) && value.size >= 0 &&
    isFiniteNumber(value.lastOpenedAt)
    ? value as unknown as RecentFileEntry
    : null;
}

function parseProfile(value: Record<string, unknown>): PrinterProfile | null {
  const numericKeys = [
    "bedWidthMm", "bedDepthMm", "maximumHeightMm",
    "maximumHotendCelsius", "maximumBedCelsius", "baudRate",
  ] as const;
  if (!isString(value.id) || !isString(value.name) ||
    !isString(value.firmware) || !FIRMWARE_DIALECTS.has(value.firmware) ||
    !numericKeys.every((key) => isFiniteNumber(value[key]) && value[key] > 0) ||
    !isNullableString(value.preferredPort) ||
    !isNullableString(value.usbSerialNumber) ||
    !isNullableString(value.identityKey)) return null;
  return value as unknown as PrinterProfile;
}

function parseHistory(value: Record<string, unknown>): PrintHistoryEntry | null {
  const validMode = value.mode === "real" || value.mode === "test";
  const validOutcome = ["completed", "stopped", "disconnected", "failed"].includes(String(value.outcome));
  return isString(value.id) && isString(value.fileName) && validMode && validOutcome &&
    isFiniteNumber(value.startedAt) && isFiniteNumber(value.finishedAt) &&
    isFiniteNumber(value.elapsedSeconds) && value.elapsedSeconds >= 0 &&
    isNullableString(value.profileId) &&
    (value.filamentUsedGrams === undefined || value.filamentUsedGrams === null || isFiniteNumber(value.filamentUsedGrams))
    ? { ...(value as unknown as PrintHistoryEntry), filamentUsedGrams: isFiniteNumber(value.filamentUsedGrams) ? value.filamentUsedGrams : null }
    : null;
}

function parseFailureReport(value: Record<string, unknown>): PrintFailureReport | null {
  const position = value.position;
  const temperatures = value.temperatures;
  if (!isRecord(position) || !isRecord(temperatures)) return null;
  const validOutcome = value.outcome === "stopped" || value.outcome === "disconnected" || value.outcome === "failed";
  return isString(value.id) && isString(value.fileName) && validOutcome &&
    [value.occurredAt, value.elapsedSeconds, value.commandIndex, value.layer].every(isFiniteNumber) &&
    [position.x, position.y, position.z].every(isFiniteNumber) &&
    [temperatures.hotend, temperatures.targetHotend, temperatures.bed, temperatures.targetBed].every(isFiniteNumber) &&
    isNullableString(value.message) && isNullableString(value.lastCommand) &&
    Array.isArray(value.terminalLines) && value.terminalLines.every(isString)
    ? value as unknown as PrintFailureReport
    : null;
}

function parseSpool(value: Record<string, unknown>): FilamentSpool | null {
  return isString(value.id) && isString(value.name) && isString(value.material) &&
    isString(value.color) && isFiniteNumber(value.remainingGrams) && value.remainingGrams >= 0 &&
    (value.costPerKilogram === null || isFiniteNumber(value.costPerKilogram)) &&
    (value.driedAt === null || isFiniteNumber(value.driedAt))
    ? value as unknown as FilamentSpool
    : null;
}

function parseMaintenance(value: Record<string, unknown>): MaintenanceTask | null {
  return isString(value.id) && isString(value.name) &&
    isFiniteNumber(value.intervalHours) && value.intervalHours > 0 &&
    isFiniteNumber(value.completedPrintHours) && value.completedPrintHours >= 0 &&
    (value.lastCompletedAt === null || isFiniteNumber(value.lastCompletedAt))
    ? value as unknown as MaintenanceTask
    : null;
}

function parseMacro(value: Record<string, unknown>): GcodeMacro | null {
  return isString(value.id) && isString(value.name) && isString(value.commands) &&
    typeof value.requiresConfirmation === "boolean"
    ? value as unknown as GcodeMacro
    : null;
}

function parseQueueEntry(value: Record<string, unknown>): QueuedPrint | null {
  return isString(value.id) && isString(value.path) && isString(value.name) &&
    isFiniteNumber(value.addedAt)
    ? value as unknown as QueuedPrint
    : null;
}

function parseRecoveryCheckpoint(value: unknown): RecoveryCheckpoint | null {
  if (!isRecord(value)) return null;
  const numericKeys = ["commandIndex", "layer", "totalLayers", "elapsedSeconds", "capturedAt"] as const;
  return isString(value.fileName) && isString(value.filePath) && isString(value.fileSha256) &&
    numericKeys.every((key) => isFiniteNumber(value[key]) && value[key] >= 0) &&
    (value.state === "printing" || value.state === "interrupted")
    ? value as unknown as RecoveryCheckpoint
    : null;
}

export function parseNotificationPreferences(value: unknown): NotificationPreferences {
  if (!isRecord(value)) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  const read = (key: keyof NotificationPreferences): boolean =>
    typeof value[key] === "boolean" ? value[key] : DEFAULT_NOTIFICATION_PREFERENCES[key];
  return {
    enabled: read("enabled"),
    printStarted: read("printStarted"),
    printPaused: read("printPaused"),
    printCompleted: read("printCompleted"),
    printStopped: read("printStopped"),
    printerDisconnected: read("printerDisconnected"),
    printerErrors: read("printerErrors"),
    temperatureReached: read("temperatureReached"),
  };
}

export function parseOperationsSettings(value: unknown): OperationsSettings {
  if (!isRecord(value)) return structuredClone(DEFAULT_OPERATIONS_SETTINGS);
  const defaults = DEFAULT_OPERATIONS_SETTINGS;
  const profiles = filterRecords(value.profiles, parseProfile);
  const safeProfiles = profiles.length > 0 ? profiles : structuredClone(defaults.profiles);
  const requestedProfile = isString(value.activeProfileId) ? value.activeProfileId : defaults.activeProfileId;
  const spools = filterRecords(value.spools, parseSpool);
  const requestedSpool = isString(value.activeSpoolId) ? value.activeSpoolId : null;
  const camera = isRecord(value.camera)
    ? { enabled: value.camera.enabled === true, streamUrl: isString(value.camera.streamUrl) ? value.camera.streamUrl : "" }
    : { ...defaults.camera };
  const network = isRecord(value.network)
    ? {
        enabled: value.network.enabled === true,
        port: Number.isInteger(value.network.port) && Number(value.network.port) >= 1024 && Number(value.network.port) <= 65535
          ? Number(value.network.port) : defaults.network.port,
        readOnly: value.network.readOnly !== false,
      }
    : { ...defaults.network };

  return {
    profiles: safeProfiles,
    activeProfileId: safeProfiles.some((profile) => profile.id === requestedProfile) ? requestedProfile : safeProfiles[0].id,
    history: filterRecords(value.history, parseHistory).slice(0, MAXIMUM_HISTORY_ENTRIES),
    failureReports: filterRecords(value.failureReports, parseFailureReport).slice(0, 50),
    spools,
    activeSpoolId: spools.some((spool) => spool.id === requestedSpool) ? requestedSpool : null,
    maintenance: filterRecords(value.maintenance, parseMaintenance),
    macros: filterRecords(value.macros, parseMacro),
    queue: filterRecords(value.queue, parseQueueEntry),
    camera,
    network,
    recoveryCheckpoint: parseRecoveryCheckpoint(value.recoveryCheckpoint),
    dismissedPrinterIdentities: Array.isArray(value.dismissedPrinterIdentities)
      ? value.dismissedPrinterIdentities.filter(isString).slice(0, MAXIMUM_DISMISSED_IDENTITIES)
      : [],
  };
}

export function parseAppSettingsSnapshot(value: unknown): AppSettingsSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    recentFiles: filterRecords(value.recentFiles, parseRecentFile).slice(0, MAXIMUM_RECENT_FILES),
    notifications: parseNotificationPreferences(value.notifications),
    operations: parseOperationsSettings(value.operations),
  };
}

export { MAXIMUM_RECENT_FILES };
