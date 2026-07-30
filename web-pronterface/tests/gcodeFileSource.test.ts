import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import {
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  VerifiedGcodeCommandSource,
} from "../electron/main/files/VerifiedGcodeCommandSource";

function sha256(
  value: string,
): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

test(
  "verified command source streams the original printable commands",
  async (context) => {
    const directory =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          "printinterface-source-",
        ),
      );
    context.after(
      () =>
        rm(directory, {
          recursive: true,
          force: true,
        }),
    );
    const filePath =
      path.join(
        directory,
        "verified.gcode",
      );
    const spoolRoot =
      path.join(
        directory,
        "spool",
      );
    const text = [
      "; generated fixture",
      "  G28 ; home",
      "%",
      "M105",
      "",
    ].join("\r\n");
    await writeFile(
      filePath,
      text,
      "utf8",
    );
    const source =
      await VerifiedGcodeCommandSource
        .open(
          {
            path: filePath,
            size:
              Buffer.byteLength(
                text,
              ),
            sha256: sha256(text),
          },
          2,
          spoolRoot,
        );
    await writeFile(
      filePath,
      "M112\nM999\n",
      "utf8",
    );
    const commands: string[] = [];

    for await (
      const command of source
    ) {
      commands.push(command);
    }

    assert.deepEqual(
      commands,
      [
        "G28",
        "M105",
      ],
    );
    assert.deepEqual(
      await readdir(spoolRoot),
      [],
    );
  },
);

test(
  "verified command source rejects a file changed after preview",
  async (context) => {
    const directory =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          "printinterface-source-",
        ),
      );
    context.after(
      () =>
        rm(directory, {
          recursive: true,
          force: true,
        }),
    );
    const filePath =
      path.join(
        directory,
        "changed.gcode",
      );
    const spoolRoot =
      path.join(
        directory,
        "spool",
      );
    const previewText = "G28\n";
    const changedText = "M28\n";
    await writeFile(
      filePath,
      changedText,
      "utf8",
    );

    await assert.rejects(
      VerifiedGcodeCommandSource
        .open(
          {
            path: filePath,
            size:
              Buffer.byteLength(
                previewText,
              ),
            sha256:
              sha256(previewText),
          },
          1,
          spoolRoot,
        ),
      /changed after it was opened/,
    );
    assert.deepEqual(
      await readdir(spoolRoot),
      [],
    );
  },
);
