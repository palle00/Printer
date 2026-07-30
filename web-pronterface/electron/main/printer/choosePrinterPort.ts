import {
  dialog,
  type BrowserWindow,
} from "electron";

import type {
  NativeSerialPortInfo,
} from "../../../src/types/printer-ipc";

function formatPortLabel(port: NativeSerialPortInfo): string {
  const description = [
    port.manufacturer,
    port.vendorId && port.productId
      ? `VID ${port.vendorId} / PID ${port.productId}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return description.length > 0
    ? `${port.path} - ${description.join(" - ")}`
    : port.path;
}

export async function choosePrinterPort(
  window: BrowserWindow,
  ports: NativeSerialPortInfo[],
): Promise<NativeSerialPortInfo | null> {
  if (ports.length === 0) {
    await dialog.showMessageBox(window, {
      type: "warning",
      title: "No serial ports found",
      message: "No serial devices were detected.",
      detail:
        "Connect the printer through USB, verify its driver is installed, and try again.",
      buttons: ["OK"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });

    return null;
  }

  const labels = ports.map(formatPortLabel);
  const cancelIndex = labels.length;
  const result = await dialog.showMessageBox(window, {
    type: "question",
    title: "Select printer port",
    message: "Choose the USB serial port used by your 3D printer.",
    detail:
      "On Windows, the printer normally appears as COM3, COM4, or another COM port.",
    buttons: [...labels, "Cancel"],
    defaultId: 0,
    cancelId: cancelIndex,
    noLink: true,
  });

  return ports[result.response] ?? null;
}
