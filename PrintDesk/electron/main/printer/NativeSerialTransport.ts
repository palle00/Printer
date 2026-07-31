import {
  ReadlineParser,
} from "@serialport/parser-readline";

import {
  SerialPort,
} from "serialport";

import type {
  NativeSerialPortInfo,
} from "../../../src/types/printer-ipc";

import type {
  SerialDisconnectHandler,
  SerialErrorHandler,
  SerialLineHandler,
  SerialOpenOptions,
  SerialTransport,
} from "../../../src/workers/serial/SerialTransport";

export class NativeSerialTransport
  implements SerialTransport {
  private port:
    SerialPort | null = null;

  private parser:
    ReadlineParser | null = null;

  private lineHandler:
    SerialLineHandler =
      () => undefined;

  private errorHandler:
    SerialErrorHandler =
      () => undefined;

  private disconnectHandler:
    SerialDisconnectHandler =
      () => undefined;

  private closing = false;
  private lifecycle:
    Promise<void> =
      Promise.resolve();

  get connected(): boolean {
    return (
      this.port?.isOpen === true
    );
  }

  static async listPorts():
    Promise<NativeSerialPortInfo[]> {
    const ports =
      await SerialPort.list();

    return ports.map(
      (port) => ({
        path: port.path,

        manufacturer:
          port.manufacturer,

        serialNumber:
          port.serialNumber,

        vendorId:
          port.vendorId,

        productId:
          port.productId,

        pnpId:
          port.pnpId,

        locationId:
          port.locationId,
      }),
    );
  }

  setLineHandler(
    handler: SerialLineHandler,
  ): void {
    this.lineHandler = handler;
  }

  setErrorHandler(
    handler: SerialErrorHandler,
  ): void {
    this.errorHandler = handler;
  }

  setDisconnectHandler(
    handler:
      SerialDisconnectHandler,
  ): void {
    this.disconnectHandler =
      handler;
  }

  connect(
    options: SerialOpenOptions,
  ): Promise<void> {
    return this.runLifecycleOperation(
      () =>
        this.openPort(options),
    );
  }

  disconnect(): Promise<void> {
    return this.runLifecycleOperation(
      () => this.closePort(),
    );
  }

  private async openPort(
    options: SerialOpenOptions,
  ): Promise<void> {
    if (this.connected) {
      throw new Error(
        "A printer is already connected.",
      );
    }

    if (this.port) {
      await this.closePort();
    }

    this.closing = false;

    const port =
      new SerialPort({
        path: options.path,

        baudRate:
          options.baudRate,

        dataBits: 8,
        stopBits: 1,

        parity: "none",

        rtscts: false,

        autoOpen: false,
      });

    const parser =
      port.pipe(
        new ReadlineParser({
          delimiter: "\n",
          encoding: "utf8",
        }),
      );

    this.port = port;
    this.parser = parser;

    parser.on(
      "data",
      (line: string) => {
        const cleaned =
          line.replace(
            /\r$/,
            "",
          );

        this.lineHandler(
          cleaned,
        );
      },
    );

    port.on(
      "error",
      (error: Error) => {
        this.errorHandler(
          error,
        );
      },
    );

    port.on(
      "close",
      (error?: Error) => {
        this.handleClose(
          port,
          error,
        );
      },
    );

    try {
      await new Promise<void>(
        (resolve, reject) => {
          port.open((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        },
      );
    } catch (error) {
      await this.cleanupPort(
        port,
        parser,
      );

      throw error;
    }
  }

  private async closePort():
    Promise<void> {
    const port = this.port;
    const parser = this.parser;

    if (!port) {
      return;
    }

    this.closing = true;

    try {
      if (port.isOpen) {
        await new Promise<void>(
          (resolve, reject) => {
            port.close((error) => {
              if (error) {
                reject(error);
                return;
              }

              resolve();
            });
          },
        );
      }
    } finally {
      await this.cleanupPort(
        port,
        parser,
      );

      this.closing = false;
    }
  }

  private runLifecycleOperation(
    operation: () =>
      Promise<void>,
  ): Promise<void> {
    const result =
      this.lifecycle.then(
        operation,
        operation,
      );

    this.lifecycle =
      result.catch(
        () => undefined,
      );

    return result;
  }

  async write(
    command: string,
  ): Promise<void> {
    const port = this.port;

    if (
      !port ||
      !port.isOpen
    ) {
      throw new Error(
        "Printer is not connected.",
      );
    }

    await new Promise<void>(
      (resolve, reject) => {
        port.write(
          `${command}\n`,

          (writeError) => {
            if (writeError) {
              reject(writeError);
              return;
            }

            port.drain(
              (drainError) => {
                if (drainError) {
                  reject(
                    drainError,
                  );

                  return;
                }

                resolve();
              },
            );
          },
        );
      },
    );
  }

  private handleClose(
    port: SerialPort,
    error?: Error,
  ): void {
    if (
      this.port !== port
    ) {
      return;
    }

    const wasExpected =
      this.closing;

    this.port = null;
    this.parser = null;

    if (!wasExpected) {
      this.disconnectHandler(
        error ??
          new Error(
            "The printer connection was closed.",
          ),
      );
    }
  }

  private async cleanupPort(
    port: SerialPort,
    parser:
      ReadlineParser | null,
  ): Promise<void> {
    if (this.port === port) {
      this.port = null;
    }

    if (this.parser === parser) {
      this.parser = null;
    }

    if (parser) {
      parser.removeAllListeners();

      try {
        port.unpipe(parser);
      } catch {
        // The parser may already be detached.
      }

      parser.destroy();
    }

    port.removeAllListeners();
  }
}
