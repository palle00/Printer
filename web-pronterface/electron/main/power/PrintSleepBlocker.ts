import {
  powerSaveBlocker,
} from "electron";

export class PrintSleepBlocker {
  private blockerId:
    number | null = null;

  get active(): boolean {
    return (
      this.blockerId !==
        null &&
      powerSaveBlocker.isStarted(
        this.blockerId,
      )
    );
  }

  setPrintingActive(
    active: boolean,
  ): void {
    if (active) {
      this.start();
    } else {
      this.stop();
    }
  }

  start(): void {
    if (this.active) {
      return;
    }

    this.blockerId =
      powerSaveBlocker.start(
        "prevent-app-suspension",
      );

    console.log(
      "[Power] Sleep prevention enabled.",
    );
  }

  stop(): void {
    if (
      this.blockerId ===
      null
    ) {
      return;
    }

    if (
      powerSaveBlocker.isStarted(
        this.blockerId,
      )
    ) {
      powerSaveBlocker.stop(
        this.blockerId,
      );
    }

    this.blockerId = null;

    console.log(
      "[Power] Sleep prevention disabled.",
    );
  }

  dispose(): void {
    this.stop();
  }
}