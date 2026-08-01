export type FirmwareDialect = "marlin" | "klipper" | "reprap" | "generic";

export interface PrinterProfile {
  id: string;
  name: string;
  firmware: FirmwareDialect;
  bedWidthMm: number;
  bedDepthMm: number;
  maximumHeightMm: number;
  maximumHotendCelsius: number;
  maximumBedCelsius: number;
  baudRate: number;
  preferredPort: string | null;
  usbSerialNumber: string | null;
  identityKey: string | null;
}

export interface PrintHistoryEntry {
  id: string;
  fileName: string;
  mode: "real" | "test";
  outcome: "completed" | "stopped" | "disconnected" | "failed";
  startedAt: number;
  finishedAt: number;
  elapsedSeconds: number;
  profileId: string | null;
  filamentUsedGrams: number | null;
}

export interface PrintFailureReport {
  id: string;
  fileName: string;
  outcome: "stopped" | "disconnected" | "failed";
  occurredAt: number;
  elapsedSeconds: number;
  commandIndex: number;
  layer: number;
  position: { x: number; y: number; z: number };
  temperatures: { hotend: number; targetHotend: number; bed: number; targetBed: number };
  message: string | null;
  lastCommand: string | null;
  terminalLines: string[];
}

export interface FilamentSpool {
  id: string;
  name: string;
  material: string;
  color: string;
  remainingGrams: number;
  costPerKilogram: number | null;
  driedAt: number | null;
}

export interface MaintenanceTask {
  id: string;
  name: string;
  intervalHours: number;
  completedPrintHours: number;
  lastCompletedAt: number | null;
}

export interface GcodeMacro {
  id: string;
  name: string;
  commands: string;
  requiresConfirmation: boolean;
}

export interface QueuedPrint {
  id: string;
  path: string;
  name: string;
  addedAt: number;
}

export interface CameraSettings {
  enabled: boolean;
  streamUrl: string;
}

export interface NetworkSettings {
  enabled: boolean;
  port: number;
  readOnly: boolean;
}

export interface RecoveryCheckpoint {
  fileName: string;
  filePath: string;
  fileSha256: string;
  commandIndex: number;
  layer: number;
  totalLayers: number;
  elapsedSeconds: number;
  capturedAt: number;
  state: "printing" | "interrupted";
}

export interface OperationsSettings {
  profiles: PrinterProfile[];
  activeProfileId: string;
  history: PrintHistoryEntry[];
  failureReports: PrintFailureReport[];
  spools: FilamentSpool[];
  activeSpoolId: string | null;
  maintenance: MaintenanceTask[];
  macros: GcodeMacro[];
  queue: QueuedPrint[];
  camera: CameraSettings;
  network: NetworkSettings;
  recoveryCheckpoint: RecoveryCheckpoint | null;
  dismissedPrinterIdentities: string[];
}

export const DEFAULT_PRINTER_PROFILE: PrinterProfile = {
  id: "default-printer",
  name: "Default printer",
  firmware: "marlin",
  bedWidthMm: 220,
  bedDepthMm: 220,
  maximumHeightMm: 250,
  maximumHotendCelsius: 300,
  maximumBedCelsius: 120,
  baudRate: 115200,
  preferredPort: null,
  usbSerialNumber: null,
  identityKey: null,
};

export const DEFAULT_OPERATIONS_SETTINGS: OperationsSettings = {
  profiles: [DEFAULT_PRINTER_PROFILE],
  activeProfileId: DEFAULT_PRINTER_PROFILE.id,
  history: [],
  failureReports: [],
  spools: [],
  activeSpoolId: null,
  maintenance: [
    { id: "lubrication", name: "Lubricate motion system", intervalHours: 200, completedPrintHours: 0, lastCompletedAt: null },
    { id: "nozzle", name: "Inspect nozzle", intervalHours: 100, completedPrintHours: 0, lastCompletedAt: null },
  ],
  macros: [
    { id: "home-all", name: "Home all axes", commands: "G28", requiresConfirmation: false },
    { id: "bed-mesh", name: "Bed mesh", commands: "G28\nG29", requiresConfirmation: true },
    { id: "motors-off", name: "Disable motors", commands: "M84", requiresConfirmation: true },
  ],
  queue: [],
  camera: { enabled: false, streamUrl: "" },
  network: { enabled: false, port: 7125, readOnly: true },
  recoveryCheckpoint: null,
  dismissedPrinterIdentities: [],
};
