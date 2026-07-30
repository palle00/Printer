import {
  dialog,
  type BrowserWindow,
} from "electron";
import {
  promises as fs,
} from "node:fs";
import path from "node:path";
import type {
  GcodeFileData,
} from "../../../src/types/desktop-files";
import type {
  RecentFileEntry,
} from "../../../src/types/settings";

const SUPPORTED_EXTENSIONS =
  new Set([
    ".gcode",
    ".gco",
    ".gc",
    ".g",
  ]);
const MAXIMUM_FILE_SIZE =
  2 * 1024 * 1024 * 1024;

export function isSupportedGcodePath(
  filePath: string,
): boolean {
  return SUPPORTED_EXTENSIONS.has(
    path
      .extname(filePath)
      .toLowerCase(),
  );
}

function assertGcodePath(
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

export async function readGcodeFile(
  requestedPath: unknown,
): Promise<GcodeFileData> {
  const details =
    await inspectGcodeFile(
      requestedPath,
    );

  return {
    path: details.path,
    name: details.name,
    size: details.size,
    text: await fs.readFile(
      details.path,
      "utf8",
    ),
  };
}

export async function inspectGcodeFile(
  requestedPath: unknown,
): Promise<RecentFileEntry> {
  const filePath =
    assertGcodePath(requestedPath);
  let details;

  try {
    details = await fs.stat(
      filePath,
    );
  } catch {
    throw new Error(
      "The G-code file no longer exists.",
    );
  }

  if (!details.isFile()) {
    throw new Error(
      "The selected path is not a file.",
    );
  }

  if (
    details.size <= 0 ||
    details.size >
      MAXIMUM_FILE_SIZE
  ) {
    throw new Error(
      details.size <= 0
        ? "The selected G-code file is empty."
        : "The selected G-code file is too large.",
    );
  }

  return {
    path: filePath,
    name:
      path.basename(filePath),
    size: details.size,
    lastOpenedAt: Date.now(),
  };
}

export async function chooseGcodeFile(
  window: BrowserWindow,
): Promise<GcodeFileData | null> {
  const result =
    await dialog.showOpenDialog(
      window,
      {
        title:
          "Open G-code file",
        properties: [
          "openFile",
        ],
        filters: [
          {
            name: "G-code files",
            extensions: [
              "gcode",
              "gco",
              "gc",
              "g",
            ],
          },
        ],
      },
    );

  if (
    result.canceled ||
    result.filePaths.length !== 1
  ) {
    return null;
  }

  return readGcodeFile(
    result.filePaths[0],
  );
}
