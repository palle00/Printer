import type { FirmwareDialect } from "../types/operations";

export interface DetectedPrinter {
  identityKey: string;
  displayName: string;
  machineType: string | null;
  firmwareName: string;
  firmwareVersion: string | null;
  firmware: FirmwareDialect;
  usbSerialNumber: string | null;
  suggestedBedWidthMm: number;
  suggestedBedDepthMm: number;
  suggestedMaximumHeightMm: number;
  dimensionsSource: "model-catalog" | "default";
}

interface KnownMachine { pattern: RegExp; name: string; width: number; depth: number; height: number }
const KNOWN_MACHINES: KnownMachine[] = [
  { pattern: /\bender[- ]?3 s1\b/i, name: "Creality Ender-3 S1", width: 220, depth: 220, height: 270 },
  { pattern: /\bender[- ]?3\b/i, name: "Creality Ender-3", width: 220, depth: 220, height: 250 },
  { pattern: /\boriginal prusa (?:i3 )?mk4\b/i, name: "Original Prusa MK4", width: 250, depth: 210, height: 220 },
  { pattern: /\boriginal prusa (?:i3 )?mk3/i, name: "Original Prusa MK3", width: 250, depth: 210, height: 210 },
  { pattern: /\boriginal prusa mini\b/i, name: "Original Prusa MINI", width: 180, depth: 180, height: 180 },
];

function readField(text: string, key: string): string | null {
  const match = new RegExp(`(?:^|\\s)${key}:([^\\s]+(?:\\s(?![A-Z_]+:)[^\\s]+)*)`, "i").exec(text);
  return match?.[1]?.trim() || null;
}

export function detectPrinterFromM115(lines: readonly string[], usbSerialNumber: string | null): DetectedPrinter | null {
  const response = lines.find((line) => /FIRMWARE_NAME:/i.test(line));
  if (!response) return null;
  const firmwareName = readField(response, "FIRMWARE_NAME") ?? "Unknown firmware";
  const firmwareVersion = readField(response, "FIRMWARE_VERSION") ?? /\b(?:Marlin|Klipper)\s+([^\s]+)/i.exec(firmwareName)?.[1] ?? null;
  const machineType = readField(response, "MACHINE_TYPE");
  const firmware: FirmwareDialect = /klipper/i.test(firmwareName) ? "klipper" : /marlin/i.test(firmwareName) ? "marlin" : /reprap|duet/i.test(firmwareName) ? "reprap" : "generic";
  const identity = `${machineType ?? ""} ${firmwareName}`;
  const known = KNOWN_MACHINES.find((machine) => machine.pattern.test(identity));
  return {
    identityKey: usbSerialNumber ? `usb:${usbSerialNumber}` : `firmware:${machineType ?? "unknown"}:${firmwareName}`.toLowerCase(),
    displayName: known?.name ?? machineType ?? `${firmware === "generic" ? "3D printer" : firmware[0].toUpperCase() + firmware.slice(1)} printer`,
    machineType,
    firmwareName,
    firmwareVersion,
    firmware,
    usbSerialNumber,
    suggestedBedWidthMm: known?.width ?? 220,
    suggestedBedDepthMm: known?.depth ?? 220,
    suggestedMaximumHeightMm: known?.height ?? 250,
    dimensionsSource: known ? "model-catalog" : "default",
  };
}
