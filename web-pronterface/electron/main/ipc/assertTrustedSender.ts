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
      window.webContents
  ) {
    throw new Error(
      "Unauthorized desktop request.",
    );
  }

  return window;
}
