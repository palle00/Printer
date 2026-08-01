import type {
  SerialDisconnectHandler,
  SerialErrorHandler,
  SerialLineHandler,
  SerialOpenOptions,
  SerialTransport,
} from "./SerialTransport";

export type SimulatedFirmwareResponder = (command: string, writeCount: number) => readonly string[];

export class SimulatedSerialTransport implements SerialTransport {
  private open = false;
  private lineHandler: SerialLineHandler = () => undefined;
  private errorHandler: SerialErrorHandler = () => undefined;
  private disconnectHandler: SerialDisconnectHandler = () => undefined;
  private writeCount = 0;
  readonly writes: string[] = [];

  constructor(
    private readonly respond: SimulatedFirmwareResponder = () => ["ok"],
  ) {}

  get connected(): boolean {
    return this.open;
  }

  setLineHandler(handler: SerialLineHandler): void {
    this.lineHandler = handler;
  }

  setErrorHandler(handler: SerialErrorHandler): void {
    this.errorHandler = handler;
  }

  setDisconnectHandler(handler: SerialDisconnectHandler): void {
    this.disconnectHandler = handler;
  }

  async connect(_options: SerialOpenOptions): Promise<void> {
    if (this.open) throw new Error("Simulator is already connected.");
    this.open = true;
  }

  async disconnect(): Promise<void> {
    this.open = false;
  }

  async write(command: string): Promise<void> {
    if (!this.open) throw new Error("Printer is not connected.");
    this.writes.push(command);
    const responses = this.respond(command, ++this.writeCount);
    queueMicrotask(() => responses.forEach((line) => this.lineHandler(line)));
  }

  emitLine(line: string): void {
    this.lineHandler(line);
  }

  emitError(error: Error): void {
    this.errorHandler(error);
  }

  disconnectUnexpectedly(error = new Error("Simulated disconnect.")): void {
    this.open = false;
    this.disconnectHandler(error);
  }
}
