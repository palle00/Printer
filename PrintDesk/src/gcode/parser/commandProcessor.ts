import type { GcodeSegmentSink } from "../GcodeSegmentStore";
import {
  processMotionCommand,
} from "./motionProcessor";
import type {
  ParsedCommand,
  ParserContext,
} from "./parserTypes";

type MotionCommand =
  | "G0"
  | "G1"
  | "G2"
  | "G3";

function isMotionCommand(
  command: string,
): command is MotionCommand {
  return (
    command === "G0" ||
    command === "G1" ||
    command === "G2" ||
    command === "G3"
  );
}

export function processParsedCommand(
  context: ParserContext,
  parsed: ParsedCommand,
  commandIndex: number,
  segmentBuilder:
    GcodeSegmentSink,
): number {
  const {
    command,
    parameters,
  } = parsed;
  const {
    machine,
    totals,
    profile,
  } = context;

  if (
    parameters.f !== undefined &&
    parameters.f > 0
  ) {
    machine.feedRate =
      parameters.f *
      machine.unitScale;
  }

  if (command === "G20") {
    machine.unitScale = 25.4;
  } else if (command === "G21") {
    machine.unitScale = 1;
  } else if (command === "G90") {
    machine.absolutePositioning = true;
  } else if (command === "G91") {
    machine.absolutePositioning = false;
  } else if (command === "M82") {
    machine.absoluteExtrusion = true;
  } else if (command === "M83") {
    machine.absoluteExtrusion = false;
  } else if (command === "M220") {
    if (
      parameters.s !== undefined &&
      parameters.s > 0
    ) {
      machine.speedMultiplier =
        parameters.s / 100;
    }
  } else if (command === "M204") {
    const nextPrintAcceleration =
      parameters.p ??
      parameters.s;

    if (
      nextPrintAcceleration !==
        undefined &&
      nextPrintAcceleration > 0
    ) {
      machine.printAcceleration =
        nextPrintAcceleration *
        machine.unitScale;
    }

    if (
      parameters.t !== undefined &&
      parameters.t > 0
    ) {
      machine.travelAcceleration =
        parameters.t *
        machine.unitScale;
    }
  } else if (command === "G92") {
    if (parameters.x !== undefined) {
      machine.position.x =
        parameters.x *
        machine.unitScale;
    }
    if (parameters.y !== undefined) {
      machine.position.y =
        parameters.y *
        machine.unitScale;
    }
    if (parameters.z !== undefined) {
      machine.position.z =
        parameters.z *
        machine.unitScale;
    }
    if (parameters.e !== undefined) {
      machine.position.e =
        parameters.e *
        machine.unitScale;
    }
  } else if (
    command === "M104" ||
    command === "M109"
  ) {
    const target =
      parameters.s ??
      parameters.r;

    if (
      target !== undefined &&
      target >= 0
    ) {
      totals.maximumHotendTemperature =
        Math.max(
          totals
            .maximumHotendTemperature ??
            target,
          target,
        );
    }

    if (
      command === "M109" &&
      (target ?? 0) > 0
    ) {
      totals.heatingSeconds +=
        profile
          .nozzleHeatingWaitSeconds;
      return profile
        .nozzleHeatingWaitSeconds;
    }
  } else if (
    command === "M140" ||
    command === "M190"
  ) {
    const target =
      parameters.s ??
      parameters.r;

    if (
      target !== undefined &&
      target >= 0
    ) {
      totals.maximumBedTemperature =
        Math.max(
          totals
            .maximumBedTemperature ??
            target,
          target,
        );
    }

    if (
      command === "M190" &&
      (target ?? 0) > 0
    ) {
      totals.heatingSeconds +=
        profile.bedHeatingWaitSeconds;
      return profile
        .bedHeatingWaitSeconds;
    }
  } else if (command === "G4") {
    return Math.max(
      0,
      parameters.p !== undefined
        ? parameters.p / 1000
        : parameters.s ?? 0,
    );
  } else if (
    command === "M0" ||
    command === "M1" ||
    command === "M25"
  ) {
    return profile.pauseSeconds;
  } else if (
    command === "M600"
  ) {
    return profile
      .filamentChangeSeconds;
  } else if (
    isMotionCommand(command)
  ) {
    return processMotionCommand(
      context,
      command,
      parameters,
      commandIndex,
      segmentBuilder,
    );
  }

  return 0;
}
