import type {
  PrinterWorkerCommand,
} from "../../types/printer";

import type {
  WorkerEvents,
} from "../core/WorkerEvents";

type ConnectPayload = Extract<
  PrinterWorkerCommand,
  {
    type: "CONNECT";
  }
>["payload"];

type LineHandler = (
  line: string,
) => void;

export class SerialConnection {
  private reader:
    | ReadableStreamDefaultReader<Uint8Array>
    | null = null;

  private writer:
    | WritableStreamDefaultWriter<Uint8Array>
    | null = null;

  private connectedState = false;
  private disconnecting = false;

  private incomingBuffer = "";

  private lineHandler:
    LineHandler | null = null;

  private readonly encoder =
    new TextEncoder();

  private readonly decoder =
    new TextDecoder();

  constructor(
    private readonly events:
      WorkerEvents,
  ) {}

  get connected(): boolean {
    return this.connectedState;
  }

  setLineHandler(
    handler: LineHandler,
  ): void {
    this.lineHandler = handler;
  }

  async connect(
    payload: ConnectPayload,
  ): Promise<void> {
    if (this.connectedState) {
      return;
    }

    this.disconnecting = false;
    this.incomingBuffer = "";

    try {
      this.reader =
        payload.readable.getReader();

      this.writer =
        payload.writable.getWriter();

      this.connectedState = true;

      this.events.connected();

      void this.runReadLoop(
        this.reader,
      );
    } catch (error) {
      this.connectedState = false;

      await this.releaseStreams();

      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (
      !this.connectedState &&
      !this.reader &&
      !this.writer
    ) {
      return;
    }

    this.disconnecting = true;
    this.connectedState = false;

    await this.releaseStreams();

    this.incomingBuffer = "";

    this.events.disconnected();

    this.disconnecting = false;
  }

  async write(
    command: string,
  ): Promise<void> {
    if (
      !this.connectedState ||
      !this.writer
    ) {
      throw new Error(
        "Printer is not connected.",
      );
    }

    await this.writer.write(
      this.encoder.encode(
        `${command}\n`,
      ),
    );
  }

  private async runReadLoop(
    activeReader:
      ReadableStreamDefaultReader<Uint8Array>,
  ): Promise<void> {
    try {
      while (
        this.reader ===
        activeReader
      ) {
        const result =
          await activeReader.read();

        if (result.done) {
          break;
        }

        this.incomingBuffer +=
          this.decoder.decode(
            result.value,
            {
              stream: true,
            },
          );

        const lines =
          this.incomingBuffer.split(
            /\r?\n/,
          );

        this.incomingBuffer =
          lines.pop() ?? "";

        for (const line of lines) {
          const cleaned = line.trim();

          if (!cleaned) {
            continue;
          }

          this.events.terminalIn(
            cleaned,
          );

          this.lineHandler?.(
            cleaned,
          );
        }
      }
    } catch (error) {
      if (!this.disconnecting) {
        this.events.error(error);
      }
    }
  }

  private async releaseStreams():
    Promise<void> {
    const activeReader =
      this.reader;

    const activeWriter =
      this.writer;

    this.reader = null;
    this.writer = null;

    try {
      await activeReader?.cancel();
    } catch {
      // Ignore stream cancellation
      // errors during disconnect.
    }

    try {
      activeReader?.releaseLock();
    } catch {
      // The lock may already have
      // been released.
    }

    try {
      await activeWriter?.close();
    } catch {
      // Ignore stream close errors
      // during disconnect.
    }

    try {
      activeWriter?.releaseLock();
    } catch {
      // The lock may already have
      // been released.
    }
  }
}