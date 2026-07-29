export interface SerialOpenOptions {
  path: string;
  baudRate: number;
}

export type SerialLineHandler = (
  line: string,
) => void;

export type SerialErrorHandler = (
  error: Error,
) => void;

export type SerialDisconnectHandler = (
  error?: Error,
) => void;

export interface SerialTransport {
  readonly connected: boolean;

  setLineHandler(
    handler: SerialLineHandler,
  ): void;

  setErrorHandler(
    handler: SerialErrorHandler,
  ): void;

  setDisconnectHandler(
    handler:
      SerialDisconnectHandler,
  ): void;

  connect(
    options: SerialOpenOptions,
  ): Promise<void>;

  disconnect(): Promise<void>;

  write(
    command: string,
  ): Promise<void>;
}