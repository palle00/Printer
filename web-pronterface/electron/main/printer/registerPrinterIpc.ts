import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";

import type {
  ParsedGcode,
} from "../../../src/types/gcode";

import {
  PRINTER_IPC,
  type NativeSerialPortInfo,
  type PrinterConnectionResult,
  type RealPrintPayload,
} from "../../../src/types/printer-ipc";

import type {
  PrinterRuntime,
} from "./PrinterRuntime";

interface RegisterPrinterIpcOptions {
  getWindow():
    BrowserWindow | null;

  runtime:
    PrinterRuntime;
}

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  window: BrowserWindow | null,
): BrowserWindow {
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !==
      window.webContents
  ) {
    throw new Error(
      "Unauthorized printer request.",
    );
  }

  return window;
}

function assertBaudRate(
  value: unknown,
): number {
  const baudRate =
    value === undefined
      ? 115200
      : Number(value);

  if (
    !Number.isInteger(
      baudRate,
    ) ||
    baudRate < 1200 ||
    baudRate > 2_000_000
  ) {
    throw new Error(
      "Invalid serial baud rate.",
    );
  }

  return baudRate;
}

function assertRealPrintPayload(
  value: unknown,
): asserts value is RealPrintPayload {
  if (
    !value ||
    typeof value !== "object"
  ) {
    throw new Error(
      "Invalid real-print payload.",
    );
  }

  const print =
    value as Partial<RealPrintPayload>;

  if (
    typeof print.fileName !== "string" ||
    print.fileName.trim().length === 0
  ) {
    throw new Error(
      "Print file name is missing.",
    );
  }

  if (
    !Array.isArray(print.lines) ||
    !print.lines.every(
      (line) =>
        typeof line === "string",
    )
  ) {
    throw new Error(
      "Print payload contains invalid G-code lines.",
    );
  }

  if (
    typeof print.totalLayers !== "number" ||
    !Number.isFinite(
      print.totalLayers,
    ) ||
    print.totalLayers < 0
  ) {
    throw new Error(
      "Print payload contains an invalid layer count.",
    );
  }
}

function assertParsedGcode(
  value: unknown,
): asserts value is ParsedGcode {
  if (
    !value ||
    typeof value !== "object"
  ) {
    throw new Error(
      "Invalid test-print payload.",
    );
  }

  const gcode =
    value as Partial<ParsedGcode>;

  if (
    typeof gcode.fileName !== "string" ||
    !Array.isArray(gcode.lines) ||
    !Array.isArray(gcode.segments) ||
    typeof gcode.totalLayers !== "number" ||
    typeof gcode.printableLines !== "number"
  ) {
    throw new Error(
      "Invalid test-print payload.",
    );
  }
}

function formatPortLabel(
  port: NativeSerialPortInfo,
): string {
  const description = [
    port.manufacturer,
    port.vendorId &&
    port.productId
      ? `VID ${port.vendorId} / PID ${port.productId}`
      : null,
  ].filter(
    (
      value,
    ): value is string =>
      Boolean(value),
  );

  return description.length > 0
    ? `${port.path} — ${description.join(" — ")}`
    : port.path;
}

async function choosePort(
  window: BrowserWindow,
  ports: NativeSerialPortInfo[],
): Promise<
  NativeSerialPortInfo | null
> {
  if (ports.length === 0) {
    await dialog.showMessageBox(
      window,
      {
        type: "warning",

        title:
          "No serial ports found",

        message:
          "No serial devices were detected.",

        detail:
          "Connect the printer through USB, verify its driver is installed, and try again.",

        buttons: ["OK"],

        defaultId: 0,
        cancelId: 0,

        noLink: true,
      },
    );

    return null;
  }

  const labels =
    ports.map(
      formatPortLabel,
    );

  const cancelIndex =
    labels.length;

  const result =
    await dialog.showMessageBox(
      window,
      {
        type: "question",

        title:
          "Select printer port",

        message:
          "Choose the USB serial port used by your 3D printer.",

        detail:
          "On Windows, the printer normally appears as COM3, COM4, or another COM port.",

        buttons: [
          ...labels,
          "Cancel",
        ],

        defaultId: 0,
        cancelId:
          cancelIndex,

        noLink: true,
      },
    );

  return (
    ports[
      result.response
    ] ?? null
  );
}

export function registerPrinterIpc({
  getWindow,
  runtime,
}: RegisterPrinterIpcOptions):
  () => void {
  const channels = [
    PRINTER_IPC.listPorts,
    PRINTER_IPC.connect,
    PRINTER_IPC.disconnect,
    PRINTER_IPC.sendGcode,
    PRINTER_IPC.startPrint,
    PRINTER_IPC.startTestPrint,
    PRINTER_IPC.pausePrint,
    PRINTER_IPC.resumePrint,
    PRINTER_IPC.stopPrint,
    PRINTER_IPC.resetPrint,
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(
      channel,
    );
  }

  ipcMain.handle(
    PRINTER_IPC.listPorts,

    async (event) => {
      assertTrustedSender(
        event,
        getWindow(),
      );

      return runtime.listPorts();
    },
  );

  ipcMain.handle(
    PRINTER_IPC.connect,

    async (
      event,
      requestedBaudRate:
        unknown,
    ): Promise<
      PrinterConnectionResult | null
    > => {
      const window =
        assertTrustedSender(
          event,
          getWindow(),
        );

      const baudRate =
        assertBaudRate(
          requestedBaudRate,
        );

      const ports =
        await runtime.listPorts();

      const selectedPort =
        await choosePort(
          window,
          ports,
        );

      if (!selectedPort) {
        return null;
      }

      await runtime.connect(
        selectedPort.path,
        baudRate,
      );

      return {
        path:
          selectedPort.path,

        baudRate,
      };
    },
  );

  ipcMain.handle(
    PRINTER_IPC.disconnect,

    async (event) => {
      assertTrustedSender(
        event,
        getWindow(),
      );

      await runtime.disconnect();
    },
  );

  ipcMain.handle(
    PRINTER_IPC.sendGcode,

    async (
      event,
      value: unknown,
    ) => {
      assertTrustedSender(
        event,
        getWindow(),
      );

      if (
        typeof value !==
        "string"
      ) {
        throw new Error(
          "G-code must be a string.",
        );
      }

      await runtime.sendGcode(
        value,
      );
    },
  );

  ipcMain.handle(
  PRINTER_IPC.startPrint,

  (
    event,
    value: unknown,
  ): void => {
    assertTrustedSender(
      event,
      getWindow(),
    );

    assertRealPrintPayload(
      value,
    );

    runtime.startPrint(
      value,
    );
  },
);
ipcMain.handle(
  PRINTER_IPC.startTestPrint,

  (
    event,
    value: unknown,
  ): void => {
    assertTrustedSender(
      event,
      getWindow(),
    );

    assertParsedGcode(
      value,
    );

    runtime.startTestPrint(
      value,
    );
  },
);

  ipcMain.handle(
    PRINTER_IPC.pausePrint,

    (event) => {
      assertTrustedSender(
        event,
        getWindow(),
      );

      runtime.pausePrint();
    },
  );

  ipcMain.handle(
    PRINTER_IPC.resumePrint,

    (event) => {
      assertTrustedSender(
        event,
        getWindow(),
      );

      runtime.resumePrint();
    },
  );

  ipcMain.handle(
    PRINTER_IPC.stopPrint,

    (event) => {
      assertTrustedSender(
        event,
        getWindow(),
      );

      runtime.stopPrint();
    },
  );

  ipcMain.handle(
    PRINTER_IPC.resetPrint,

    (event) => {
      assertTrustedSender(
        event,
        getWindow(),
      );

      runtime.resetPrint();
    },
  );

  return () => {
    for (
      const channel of
      channels
    ) {
      ipcMain.removeHandler(
        channel,
      );
    }
  };
}