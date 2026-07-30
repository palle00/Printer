import path from "node:path";

export const MAXIMUM_GCODE_FILE_SIZE =
  2 * 1024 * 1024 * 1024;

const SUPPORTED_EXTENSIONS =
  new Set([
    ".gcode",
    ".gco",
    ".gc",
    ".g",
  ]);

export function isSupportedGcodePath(
  filePath: string,
): boolean {
  return SUPPORTED_EXTENSIONS.has(
    path
      .extname(filePath)
      .toLowerCase(),
  );
}

export function assertGcodePath(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    !isSupportedGcodePath(value)
  ) {
    throw new Error(
      "Choose a G-code, GCO, GC, or G file.",
    );
  }

  return path.normalize(value);
}

export function assertGcodeFileSize(
  size: number,
): void {
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MAXIMUM_GCODE_FILE_SIZE
  ) {
    throw new Error(
      size <= 0
        ? "The selected G-code file is empty."
        : "The selected G-code file is too large.",
    );
  }
}
