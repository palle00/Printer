import type {
  BrowserWindow,
  IpcMainInvokeEvent,
} from "electron";

export function assertTrustedSender(
  event: IpcMainInvokeEvent,
  window: BrowserWindow | null,
): BrowserWindow {
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !==
      window.webContents ||
    event.senderFrame !==
      window.webContents.mainFrame
  ) {
    throw new Error(
      "Unauthorized desktop request.",
    );
  }

  return window;
}
