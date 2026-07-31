import type { CancelableGcodeObject, ObjectCancellationProtocol } from "../../types/gcode";

interface ObjectCancellationMetadata {
  protocol: ObjectCancellationProtocol | null;
  objects: CancelableGcodeObject[];
}

const KLIPPER_DEFINE = /^\s*EXCLUDE_OBJECT_DEFINE\s+.*\bNAME=([A-Za-z0-9_.-]+)/i;
const MARLIN_COUNT = /^\s*M486\s+.*\bT(\d+)\b/i;

export function detectObjectCancellation(lines: readonly string[]): ObjectCancellationMetadata {
  const klipperNames = new Set<string>();
  let marlinCount = 0;

  for (const line of lines) {
    const klipper = KLIPPER_DEFINE.exec(line);
    if (klipper) klipperNames.add(klipper[1]);
    const marlin = MARLIN_COUNT.exec(line);
    if (marlin) marlinCount = Math.max(marlinCount, Number(marlin[1]));
  }

  if (klipperNames.size > 0) {
    return { protocol: "klipper", objects: Array.from(klipperNames, (name) => ({ id: name, name: name.replaceAll("_", " ") })) };
  }
  if (marlinCount > 0 && marlinCount <= 1000) {
    return { protocol: "marlin-m486", objects: Array.from({ length: marlinCount }, (_, index) => ({ id: String(index), name: `Object ${index + 1}` })) };
  }
  return { protocol: null, objects: [] };
}
