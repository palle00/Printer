import {
  dialog,
  type BrowserWindow,
} from "electron";
import {
  promises as fs,
} from "node:fs";
import {
  createHash,
} from "node:crypto";
import path from "node:path";
import type {
  GcodeFileData,
} from "../../../src/types/desktop-files";
import type {
  RecentFileEntry,
} from "../../../src/types/settings";
import {
  assertGcodeFileSize,
  assertGcodePath,
} from "./gcodeFileValidation";

export async function readGcodeFile(
  requestedPath: unknown,
): Promise<GcodeFileData> {
  const details =
    await inspectGcodeFile(
      requestedPath,
    );
  const bytes = await fs.readFile(
    details.path,
  );

  if (bytes.byteLength !== details.size) {
    throw new Error(
      "The G-code file changed while it was being opened. Open it again.",
    );
  }

  return {
    path: details.path,
    name: details.name,
    size: bytes.byteLength,
    sha256: createHash("sha256")
      .update(bytes)
      .digest("hex"),
    text: bytes.toString("utf8"),
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

  assertGcodeFileSize(
    details.size,
  );

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
