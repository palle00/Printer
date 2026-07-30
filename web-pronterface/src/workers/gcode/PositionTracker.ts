import type {
  PrinterPosition,
} from "../../types/printer";

import type {
  PrinterEvents,
} from "../core/PrinterEvents";

function parseValue(
  command: string,
  axis: "X" | "Y" | "Z" | "E",
): number | null {
  const match = command.match(
    new RegExp(
      `${axis}([-+]?\\d*\\.?\\d+)`,
      "i",
    ),
  );

  if (!match) {
    return null;
  }

  const value = Number(match[1]);

  return Number.isFinite(value)
    ? value
    : null;
}

function commandContainsAxis(
  command: string,
  axis: "X" | "Y" | "Z",
): boolean {
  return new RegExp(
    `${axis}(?:[-+\\d.]|\\s|$)`,
    "i",
  ).test(command);
}

export class PositionTracker {
  private absolutePositioning = true;
  private absoluteExtrusion = true;
  private unitScale = 1;

  private position:
    PrinterPosition = {
      x: 0,
      y: 0,
      z: 0,
      e: 0,
    };

  constructor(
    private readonly events:
      PrinterEvents,
  ) {}

  get current(): PrinterPosition {
    return {
      ...this.position,
    };
  }

  set(
    position: PrinterPosition,
  ): void {
    this.position = {
      ...position,
    };

    this.events.position(
      this.position,
    );
  }

  reset(): void {
    this.absolutePositioning = true;
    this.absoluteExtrusion = true;
    this.unitScale = 1;

    this.set({
      x: 0,
      y: 0,
      z: 0,
      e: 0,
    });
  }

  trackAcknowledgedCommand(
    command: string,
  ): void {
    const upper =
      command.trim().toUpperCase();

    const code =
      upper.match(
        /^([GMT]\d+)/,
      )?.[1];

    if (!code) {
      return;
    }

    if (code === "G90") {
      this.absolutePositioning = true;
      return;
    }

    if (code === "G20") {
      this.unitScale = 25.4;
      return;
    }

    if (code === "G21") {
      this.unitScale = 1;
      return;
    }

    if (code === "G91") {
      this.absolutePositioning = false;
      return;
    }

    if (code === "M82") {
      this.absoluteExtrusion = true;
      return;
    }

    if (code === "M83") {
      this.absoluteExtrusion = false;
      return;
    }

    if (code === "G28") {
      this.trackHomeCommand(
        upper,
      );

      return;
    }

    if (code === "G92") {
      this.trackSetPositionCommand(
        upper,
      );

      return;
    }

    if (
      code !== "G0" &&
      code !== "G1" &&
      code !== "G2" &&
      code !== "G3"
    ) {
      return;
    }

    this.trackMovementCommand(
      upper,
    );
  }

  private trackHomeCommand(
    command: string,
  ): void {
    const hasX =
      commandContainsAxis(
        command,
        "X",
      );

    const hasY =
      commandContainsAxis(
        command,
        "Y",
      );

    const hasZ =
      commandContainsAxis(
        command,
        "Z",
      );

    if (!hasX && !hasY && !hasZ) {
      this.position = {
        ...this.position,

        x: 0,
        y: 0,
        z: 0,
      };
    } else {
      if (hasX) {
        this.position.x = 0;
      }

      if (hasY) {
        this.position.y = 0;
      }

      if (hasZ) {
        this.position.z = 0;
      }
    }

    this.events.position(
      this.position,
    );
  }

  private trackSetPositionCommand(
    command: string,
  ): void {
    const x = parseValue(
      command,
      "X",
    );

    const y = parseValue(
      command,
      "Y",
    );

    const z = parseValue(
      command,
      "Z",
    );

    const e = parseValue(
      command,
      "E",
    );

    if (x !== null) {
      this.position.x =
        x * this.unitScale;
    }

    if (y !== null) {
      this.position.y =
        y * this.unitScale;
    }

    if (z !== null) {
      this.position.z =
        z * this.unitScale;
    }

    if (e !== null) {
      this.position.e =
        e * this.unitScale;
    }

    this.events.position(
      this.position,
    );
  }

  private trackMovementCommand(
    command: string,
  ): void {
    const x = parseValue(
      command,
      "X",
    );

    const y = parseValue(
      command,
      "Y",
    );

    const z = parseValue(
      command,
      "Z",
    );

    const e = parseValue(
      command,
      "E",
    );

    if (x !== null) {
      const scaledX =
        x * this.unitScale;
      this.position.x =
        this.absolutePositioning
          ? scaledX
          : this.position.x +
            scaledX;
    }

    if (y !== null) {
      const scaledY =
        y * this.unitScale;
      this.position.y =
        this.absolutePositioning
          ? scaledY
          : this.position.y +
            scaledY;
    }

    if (z !== null) {
      const scaledZ =
        z * this.unitScale;
      this.position.z =
        this.absolutePositioning
          ? scaledZ
          : this.position.z +
            scaledZ;
    }

    if (e !== null) {
      const scaledE =
        e * this.unitScale;
      this.position.e =
        this.absoluteExtrusion
          ? scaledE
          : this.position.e +
            scaledE;
    }

    this.events.position(
      this.position,
    );
  }
}
