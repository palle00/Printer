import {
  app,
  dialog,
  type BrowserWindow,
} from "electron";
import {
  autoUpdater,
  type UpdateDownloadedEvent,
} from "electron-updater";

const INITIAL_CHECK_DELAY_MS =
  10_000;
const UPDATE_CHECK_INTERVAL_MS =
  6 * 60 * 60 * 1_000;

interface ApplicationUpdaterOptions {
  getWindow(): BrowserWindow | null;
  showWindow(): void;
}

export class ApplicationUpdater {
  private checkTimer:
    ReturnType<
      typeof setTimeout
    > | null = null;
  private checkInterval:
    ReturnType<
      typeof setInterval
    > | null = null;
  private downloadedUpdate:
    UpdateDownloadedEvent | null =
      null;
  private printActive = false;
  private promptOpen = false;
  private installing = false;
  private postponed = false;
  private disposed = false;

  constructor(
    private readonly options:
      ApplicationUpdaterOptions,
  ) {}

  start(): void {
    if (
      this.disposed ||
      !app.isPackaged
    ) {
      return;
    }

    autoUpdater.autoDownload =
      true;
    autoUpdater.autoInstallOnAppQuit =
      false;
    autoUpdater.allowPrerelease =
      false;
    autoUpdater.allowDowngrade =
      false;
    autoUpdater.logger = console;
    autoUpdater.on(
      "update-downloaded",
      this.handleUpdateDownloaded,
    );
    autoUpdater.on(
      "error",
      this.handleUpdateError,
    );

    this.checkTimer =
      setTimeout(() => {
        this.checkTimer = null;
        void this.checkForUpdates();
      }, INITIAL_CHECK_DELAY_MS);
    this.checkTimer.unref();

    this.checkInterval =
      setInterval(() => {
        void this.checkForUpdates();
      }, UPDATE_CHECK_INTERVAL_MS);
    this.checkInterval.unref();
  }

  setPrintActive(
    active: boolean,
  ): void {
    this.printActive = active;

    if (!active) {
      void this.promptForUpdate();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (this.checkTimer) {
      clearTimeout(
        this.checkTimer,
      );
      this.checkTimer = null;
    }

    if (this.checkInterval) {
      clearInterval(
        this.checkInterval,
      );
      this.checkInterval = null;
    }

    autoUpdater.removeListener(
      "update-downloaded",
      this.handleUpdateDownloaded,
    );
    autoUpdater.removeListener(
      "error",
      this.handleUpdateError,
    );
  }

  private readonly handleUpdateDownloaded =
    (
      event:
        UpdateDownloadedEvent,
    ): void => {
      this.downloadedUpdate =
        event;
      void this.promptForUpdate();
    };

  private readonly handleUpdateError =
    (error: Error): void => {
      console.warn(
        "Application update failed.",
        error,
      );
    };

  private async checkForUpdates():
    Promise<void> {
    if (
      this.disposed ||
      this.downloadedUpdate ||
      this.installing
    ) {
      return;
    }

    try {
      await autoUpdater
        .checkForUpdates();
    } catch (error) {
      this.handleUpdateError(
        error instanceof Error
          ? error
          : new Error(
              String(error),
            ),
      );
    }
  }

  private async promptForUpdate():
    Promise<void> {
    if (
      this.disposed ||
      this.printActive ||
      this.promptOpen ||
      this.installing ||
      this.postponed ||
      !this.downloadedUpdate
    ) {
      return;
    }

    this.promptOpen = true;
    this.options.showWindow();
    const window =
      this.options.getWindow();

    try {
      const result = window
        ? await dialog.showMessageBox(
            window,
            {
              type: "info",
              title:
                "PrintDeck update",
              message:
                `PrintDeck ${this.downloadedUpdate.version} is ready to install.`,
              detail:
                "The application will close, install the update, and reopen.",
              buttons: [
                "Restart and update",
                "Later",
              ],
              defaultId: 0,
              cancelId: 1,
              noLink: true,
            },
          )
        : await dialog.showMessageBox({
            type: "info",
            title:
              "PrintDeck update",
            message:
              `PrintDeck ${this.downloadedUpdate.version} is ready to install.`,
            detail:
              "The application will close, install the update, and reopen.",
            buttons: [
              "Restart and update",
              "Later",
            ],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
          });

      if (
        result.response === 0 &&
        !this.printActive
      ) {
        this.installing = true;
        autoUpdater.quitAndInstall(
          false,
          true,
        );
      } else {
        this.postponed = true;
      }
    } finally {
      this.promptOpen = false;
    }
  }
}
