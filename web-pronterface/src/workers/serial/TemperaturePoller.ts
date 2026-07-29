import type {
  SerialQueue,
} from "./SerialQueue";

import type {
  SerialTransport,
} from "./SerialTransport";

const TEMPERATURE_INTERVAL_MS =
  2000;

interface TemperaturePollerOptions {
  connection:
    SerialTransport;

  queue:
    SerialQueue;

  isPrintActive:
    () => boolean;
}

export class TemperaturePoller {
  private readonly interval:
    ReturnType<
      typeof setInterval
    >;

  constructor(
    private readonly options:
      TemperaturePollerOptions,
  ) {
    this.interval =
      setInterval(
        () => {
          this.poll();
        },
        TEMPERATURE_INTERVAL_MS,
      );
  }

  dispose(): void {
    clearInterval(
      this.interval,
    );
  }

  private poll(): void {
    if (
      !this.options.connection.connected ||
      this.options.queue.isWaiting ||
      this.options.isPrintActive()
    ) {
      return;
    }

    void this.options.queue
      .queue("M105")
      .catch(() => undefined);
  }
}