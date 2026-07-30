import {
  createHash,
} from "node:crypto";
import {
  createReadStream,
} from "node:fs";
import type {
  FileHandle,
} from "node:fs/promises";
import {
  mkdir,
  mkdtemp,
  open,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  createInterface,
} from "node:readline";
import {
  finished,
} from "node:stream/promises";

import {
  stripGcodeLine,
} from "../../../src/gcode/commandLine";
import type {
  GcodeFileFingerprint,
} from "../../../src/types/gcode-file";
import type {
  RealPrintCommandSource,
} from "../../../src/workers/print/realPrintJob";
import {
  assertGcodeFileSize,
  assertGcodePath,
} from "./gcodeFileValidation";

const COPY_BUFFER_SIZE =
  1024 * 1024;
const SHA256_PATTERN =
  /^[a-f0-9]{64}$/;

async function writeChunk(
  handle: FileHandle,
  buffer: Buffer,
  length: number,
): Promise<void> {
  let offset = 0;

  while (offset < length) {
    const {
      bytesWritten,
    } = await handle.write(
      buffer,
      offset,
      length - offset,
      null,
    );

    if (bytesWritten === 0) {
      throw new Error(
        "Unable to create the verified G-code print source.",
      );
    }

    offset += bytesWritten;
  }
}

async function copyAndHashFile(
  source: FileHandle,
  destination: FileHandle,
  size: number,
): Promise<string> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(
    Math.min(
      COPY_BUFFER_SIZE,
      size,
    ),
  );
  let position = 0;

  while (position < size) {
    const {
      bytesRead,
    } = await source.read(
      buffer,
      0,
      Math.min(
        buffer.byteLength,
        size - position,
      ),
      position,
    );

    if (bytesRead === 0) {
      throw new Error(
        "The G-code file changed while it was being verified.",
      );
    }

    const chunk =
      buffer.subarray(
        0,
        bytesRead,
      );
    hash.update(chunk);
    await writeChunk(
      destination,
      chunk,
      bytesRead,
    );
    position += bytesRead;
  }

  return hash.digest("hex");
}

async function closeHandle(
  handle: FileHandle | null,
): Promise<void> {
  await handle?.close()
    .catch(() => undefined);
}

export class VerifiedGcodeCommandSource
  implements RealPrintCommandSource {
  private consumed = false;
  private activeInput:
    ReturnType<
      typeof createReadStream
    > | null = null;
  private closePromise:
    Promise<void> | null = null;

  private constructor(
    private readonly spoolDirectory:
      string,
    private readonly spoolPath:
      string,
    private readonly expectedCommands:
      number,
  ) {}

  static async open(
    fingerprint:
      GcodeFileFingerprint,
    expectedCommands: number,
    spoolRoot: string,
  ): Promise<VerifiedGcodeCommandSource> {
    const filePath =
      assertGcodePath(
        fingerprint.path,
      );
    assertGcodeFileSize(
      fingerprint.size,
    );

    if (
      !SHA256_PATTERN.test(
        fingerprint.sha256,
      ) ||
      !Number.isSafeInteger(
        expectedCommands,
      ) ||
      expectedCommands < 0
    ) {
      throw new Error(
        "The G-code file fingerprint is invalid.",
      );
    }

    await mkdir(
      spoolRoot,
      {
        recursive: true,
      },
    );
    const spoolDirectory =
      await mkdtemp(
        path.join(
          spoolRoot,
          "print-",
        ),
      );
    const spoolPath =
      path.join(
        spoolDirectory,
        "source.gcode",
      );
    let sourceHandle:
      FileHandle | null = null;
    let spoolHandle:
      FileHandle | null = null;

    try {
      sourceHandle = await open(
        filePath,
        "r",
      );
      const details =
        await sourceHandle.stat();

      if (
        !details.isFile() ||
        details.size !==
          fingerprint.size
      ) {
        throw new Error(
          "The G-code file changed after it was opened. Open it again before printing.",
        );
      }

      spoolHandle = await open(
        spoolPath,
        "wx",
        0o600,
      );
      const sha256 =
        await copyAndHashFile(
          sourceHandle,
          spoolHandle,
          details.size,
        );
      const finalDetails =
        await sourceHandle.stat();

      if (
        finalDetails.size !==
          fingerprint.size ||
        sha256 !==
          fingerprint.sha256
      ) {
        throw new Error(
          "The G-code file changed after it was opened. Open it again before printing.",
        );
      }

      await spoolHandle.sync();
      await spoolHandle.close();
      spoolHandle = null;
      await sourceHandle.close();
      sourceHandle = null;

      return new VerifiedGcodeCommandSource(
        spoolDirectory,
        spoolPath,
        expectedCommands,
      );
    } catch (error) {
      await Promise.all([
        closeHandle(sourceHandle),
        closeHandle(spoolHandle),
      ]);
      await rm(
        spoolDirectory,
        {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 50,
        },
      ).catch(() => undefined);
      throw error;
    }
  }

  [Symbol.asyncIterator]():
    AsyncIterator<string> {
    if (
      this.consumed ||
      this.closePromise
    ) {
      throw new Error(
        "The G-code command source is no longer available.",
      );
    }

    this.consumed = true;
    return this.readCommands();
  }

  close(): Promise<void> {
    this.closePromise ??=
      this.closeAndDelete();
    return this.closePromise;
  }

  private async closeAndDelete():
    Promise<void> {
    const input =
      this.activeInput;
    this.activeInput = null;

    if (input) {
      input.destroy();
      await finished(input)
        .catch(() => undefined);
    }

    await rm(
      this.spoolDirectory,
      {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 50,
      },
    ).catch(() => undefined);
  }

  private async *readCommands():
    AsyncGenerator<string> {
    const input =
      createReadStream(
        this.spoolPath,
        {
          encoding: "utf8",
        },
      );
    this.activeInput = input;
    const lines = createInterface({
      input,
      crlfDelay: Infinity,
    });
    let commandCount = 0;

    try {
      for await (
        const rawLine of lines
      ) {
        const command =
          stripGcodeLine(
            rawLine,
          );

        if (
          !command ||
          command === "%"
        ) {
          continue;
        }

        if (
          commandCount >=
          this.expectedCommands
        ) {
          throw new Error(
            "The verified G-code command count no longer matches its preview.",
          );
        }

        commandCount++;
        yield command;
      }

      if (
        commandCount !==
        this.expectedCommands
      ) {
        throw new Error(
          "The verified G-code command count no longer matches its preview.",
        );
      }
    } finally {
      lines.close();
      input.destroy();
      await finished(input)
        .catch(() => undefined);

      if (
        this.activeInput === input
      ) {
        this.activeInput = null;
      }

      await this.close();
    }
  }
}
