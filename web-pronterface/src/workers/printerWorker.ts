/// <reference lib="webworker" />

import type {
  PrinterWorkerCommand,
} from "../types/printer";

import {
  WorkerEvents,
} from "./core/WorkerEvents";

import {
  PositionTracker,
} from "./gcode/PositionTracker";

import {
  PrintSessionManager,
} from "./print/PrintSessionManager";

import {
  parsePrinterResponse,
} from "./serial/responseParser";

import {
  SerialConnection,
} from "./serial/SerialConnection";

import {
  SerialQueue,
} from "./serial/SerialQueue";

import {
  TemperaturePoller,
} from "./serial/TemperaturePoller";

const worker =
  self as DedicatedWorkerGlobalScope;

const events =
  new WorkerEvents(worker);

const positionTracker =
  new PositionTracker(events);

const serialConnection =
  new SerialConnection(events);

const serialQueue =
  new SerialQueue(
    serialConnection,

    events,

    (command) => {
      positionTracker
        .trackAcknowledgedCommand(
          command,
        );
    },
  );

const prints =
  new PrintSessionManager({
    events,

    serialQueue,

    positionTracker,

    isConnected: () =>
      serialConnection.connected,
  });

serialConnection.setLineHandler(
  (line) => {
    const response =
      parsePrinterResponse(
        line,

        positionTracker.current.e,
      );

    if (response.temperature) {
      events.temperature(
        response.temperature,
      );
    }

    if (response.position) {
      positionTracker.set(
        response.position,
      );
    }

    if (response.error) {
      serialQueue
        .rejectAcknowledgement(
          response.error,
        );
    }

    if (response.acknowledge) {
      serialQueue
        .resolveAcknowledgement();
    }
  },
);

/*
 * The interval owns a reference to this
 * instance for the lifetime of the worker.
 */
new TemperaturePoller({
  connection:
    serialConnection,

  queue:
    serialQueue,

  isPrintActive: () =>
    prints.isActive,
});

async function connectPrinter(
  payload: Extract<
    PrinterWorkerCommand,
    {
      type: "CONNECT";
    }
  >["payload"],
): Promise<void> {
  try {
    await serialConnection.connect(
      payload,
    );

    /*
     * Request the current position after
     * establishing a connection. M114 is
     * optional, so failure is ignored.
     */
    await serialQueue
      .queue("M114")
      .catch(() => undefined);
  } catch (error) {
    events.error(error);

    serialQueue.reset();

    await serialConnection
      .disconnect()
      .catch(() => undefined);
  }
}

async function disconnectPrinter():
  Promise<void> {
  prints.handleDisconnect();

  serialQueue.reset(
    new Error(
      "Printer disconnected.",
    ),
  );

  await serialConnection
    .disconnect()
    .catch((error: unknown) => {
      events.error(error);
    });
}

function sendManualGcode(
  gcode: string,
): void {
  void serialQueue
    .sendMany(gcode)
    .catch((error: unknown) => {
      events.error(error);
    });
}

worker.onmessage = (
  event:
    MessageEvent<
      PrinterWorkerCommand
    >,
) => {
  const message = event.data;

  switch (message.type) {
    case "CONNECT": {
      void connectPrinter(
        message.payload,
      );

      break;
    }

    case "DISCONNECT": {
      void disconnectPrinter();

      break;
    }

    case "SEND_GCODE": {
      sendManualGcode(
        message.payload,
      );

      break;
    }

    case "START_REAL_PRINT": {
      prints.startReal(
        message.payload,
      );

      break;
    }

    case "START_TEST_PRINT": {
      prints.startTest(
        message.payload,
      );

      break;
    }

    case "PAUSE_PRINT": {
      prints.pause();

      break;
    }

    case "RESUME_PRINT": {
      prints.resume();

      break;
    }

    case "STOP_PRINT": {
      prints.stop();

      break;
    }

    case "RESET_PRINT": {
      prints.reset();

      break;
    }
  }
};