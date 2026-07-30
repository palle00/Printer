import {
  Notification,
  type BrowserWindow,
  type NativeImage,
} from "electron";

import type {
  PrinterEvent,
  PrinterStatus,
} from "../../../src/types/printer";
import type {
  NotificationPreferences,
} from "../../../src/types/settings";
import type {
  AppSettingsStore,
} from "../settings/AppSettingsStore";

interface NotificationServiceOptions {
  getWindow(): BrowserWindow | null;
  showWindow(): void;
  getIcon(): NativeImage;
  settings: AppSettingsStore;
}

interface HeaterState {
  current: number;
  target: number;
  notifiedTarget: number | null;
}

const TARGET_TOLERANCE_CELSIUS =
  2;

export class NotificationService {
  private fileName: string | null =
    null;
  private activePrint = false;
  private lastStatus:
    PrinterStatus | null = null;
  private readonly hotend:
    HeaterState = {
      current: 0,
      target: 0,
      notifiedTarget: null,
    };
  private readonly bed:
    HeaterState = {
      current: 0,
      target: 0,
      notifiedTarget: null,
    };

  constructor(
    private readonly options:
      NotificationServiceOptions,
  ) {}

  handle(event: PrinterEvent): void {
    switch (event.type) {
      case "PRINT_STARTED": {
        this.fileName =
          event.fileName;
        this.activePrint = true;
        this.lastStatus =
          "printing";
        this.notify(
          "printStarted",
          "Print started",
          event.fileName,
        );
        break;
      }

      case "STATUS": {
        this.handleStatus(
          event.status,
        );
        break;
      }

      case "PRINT_FINISHED": {
        if (this.activePrint) {
          this.notify(
            "printCompleted",
            "Print completed",
            this.fileName ??
              "The print completed successfully.",
          );
        }

        this.activePrint = false;
        this.lastStatus = "idle";
        break;
      }

      case "PRINT_STOPPED": {
        if (this.activePrint) {
          this.notify(
            "printStopped",
            "Print stopped",
            this.fileName ??
              "The active print was stopped.",
          );
        }

        this.activePrint = false;
        this.lastStatus =
          event.status;
        break;
      }

      case "PRINT_RESET": {
        this.activePrint = false;
        this.fileName = null;
        this.lastStatus =
          event.status;
        break;
      }

      case "DISCONNECTED": {
        if (event.unexpected) {
          this.notify(
            "printerDisconnected",
            "Printer disconnected",
            this.activePrint &&
              this.fileName
              ? `Connection lost while printing ${this.fileName}.`
              : "The printer connection was lost.",
          );
        }

        this.activePrint = false;
        this.lastStatus =
          "disconnected";
        break;
      }

      case "ERROR": {
        this.notify(
          "printerErrors",
          "Printer error",
          event.message,
        );
        break;
      }

      case "TEMPERATURE": {
        this.updateHeater(
          "Hotend",
          this.hotend,
          event.hotend,
          event.targetHotend,
        );
        this.updateHeater(
          "Bed",
          this.bed,
          event.bed,
          event.targetBed,
        );
        break;
      }
    }
  }

  private handleStatus(
    status: PrinterStatus,
  ): void {
    if (
      status === this.lastStatus
    ) {
      return;
    }

    if (status === "paused") {
      this.notify(
        "printPaused",
        "Print paused",
        this.fileName ??
          "The print is paused.",
      );
    } else if (
      status === "printing" &&
      this.lastStatus === "paused"
    ) {
      this.notify(
        "printPaused",
        "Print resumed",
        this.fileName ??
          "The print has resumed.",
      );
    }

    this.lastStatus = status;
  }

  private updateHeater(
    name: string,
    state: HeaterState,
    current: number | undefined,
    target: number | undefined,
  ): void {
    if (
      target !== undefined &&
      target !== state.target
    ) {
      state.target = target;
      state.notifiedTarget = null;
    }

    if (current !== undefined) {
      state.current = current;
    }

    if (
      state.target <= 0 ||
      state.notifiedTarget ===
        state.target ||
      Math.abs(
        state.current -
          state.target,
      ) >
        TARGET_TOLERANCE_CELSIUS
    ) {
      return;
    }

    state.notifiedTarget =
      state.target;
    this.notify(
      "temperatureReached",
      `${name} temperature reached`,
      `${Math.round(
        state.current,
      )} °C / ${Math.round(
        state.target,
      )} °C`,
    );
  }

  private notify(
    preference:
      Exclude<
        keyof NotificationPreferences,
        "enabled"
      >,
    title: string,
    body: string,
  ): void {
    const settings =
      this.options.settings
        .getSnapshot()
        .notifications;
    const window =
      this.options.getWindow();

    if (
      !settings.enabled ||
      !settings[preference] ||
      !Notification.isSupported() ||
      (window &&
        !window.isDestroyed() &&
        window.isVisible() &&
        window.isFocused())
    ) {
      return;
    }

    const notification =
      new Notification({
        title,
        body,
        icon:
          this.options
            .getIcon()
            .resize({
              width: 256,
              height: 256,
              quality: "best",
            }),
      });
    notification.on(
      "click",
      () => {
        this.options.showWindow();
      },
    );
    notification.show();
  }
}
