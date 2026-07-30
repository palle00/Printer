import {
  getFeatureIndex,
  type GcodeFeatureCategory,
} from "../features";
import type {
  GcodeSegmentStoreBuilder,
} from "../GcodeSegmentStore";
import {
  estimateMotionSeconds,
} from "../timeEstimation";
import {
  appendArcSegments,
  appendLinearSegment,
  getArcCenterFromRadius,
  POSITION_EPSILON,
} from "./segmentGeometry";
import type {
  CommandParameters,
  ParserContext,
  Position,
} from "./parserTypes";

export function processMotionCommand(
  context: ParserContext,
  command: "G0" | "G1" | "G2" | "G3",
  parameters: CommandParameters,
  commandIndex: number,
  segmentBuilder:
    GcodeSegmentStoreBuilder,
): number {
  const {
    machine,
    totals,
  } = context;
  const start = {
    ...machine.position,
  };
  const end: Position = {
    x:
      parameters.x === undefined
        ? machine.position.x
        : machine.absolutePositioning
          ? parameters.x *
            machine.unitScale
          : machine.position.x +
            parameters.x *
              machine.unitScale,
    y:
      parameters.y === undefined
        ? machine.position.y
        : machine.absolutePositioning
          ? parameters.y *
            machine.unitScale
          : machine.position.y +
            parameters.y *
              machine.unitScale,
    z:
      parameters.z === undefined
        ? machine.position.z
        : machine.absolutePositioning
          ? parameters.z *
            machine.unitScale
          : machine.position.z +
            parameters.z *
              machine.unitScale,
    e:
      parameters.e === undefined
        ? machine.position.e
        : machine.absoluteExtrusion
          ? parameters.e *
            machine.unitScale
          : machine.position.e +
            parameters.e *
              machine.unitScale,
  };
  const extrusionAmount =
    end.e - machine.position.e;
  const extruding =
    extrusionAmount >
      POSITION_EPSILON;

  if (extruding) {
    totals.filamentLengthMm +=
      extrusionAmount;
  } else if (
    extrusionAmount <
    -POSITION_EPSILON
  ) {
    totals.retractionCount++;
  }

  if (
    machine.usesAutomaticLayers &&
    extruding
  ) {
    if (
      machine.lastAutomaticLayerZ ===
      null
    ) {
      machine.lastAutomaticLayerZ =
        end.z;
    } else if (
      end.z >
      machine.lastAutomaticLayerZ +
        0.01
    ) {
      machine.currentLayer++;
      machine.lastAutomaticLayerZ =
        end.z;
    }
  }

  const segmentLayer =
    Math.max(
      1,
      machine.currentLayer,
    );
  machine.highestLayer = Math.max(
    machine.highestLayer,
    segmentLayer,
  );
  const feature:
    GcodeFeatureCategory =
      extruding
        ? machine.activeFeature
        : "travel";
  let movementDistance =
    Math.hypot(
      end.x - start.x,
      end.y - start.y,
      end.z - start.z,
    );

  if (
    command === "G2" ||
    command === "G3"
  ) {
    let center:
      | {
          x: number;
          y: number;
        }
      | null = null;

    if (
      parameters.i !== undefined ||
      parameters.j !== undefined
    ) {
      center = {
        x:
          start.x +
          (parameters.i ?? 0) *
            machine.unitScale,
        y:
          start.y +
          (parameters.j ?? 0) *
            machine.unitScale,
      };
    } else if (
      parameters.r !== undefined
    ) {
      center =
        getArcCenterFromRadius(
          start.x,
          start.y,
          end.x,
          end.y,
          parameters.r *
            machine.unitScale,
          command === "G2",
        );
    }

    if (center) {
      movementDistance =
        appendArcSegments(
          segmentBuilder,
          start,
          end,
          center.x,
          center.y,
          command === "G2",
          segmentLayer,
          commandIndex,
          extruding,
          feature,
          totals.featurePathCounts,
        );
    } else {
      appendLinearSegment(
        segmentBuilder,
        start,
        end,
        segmentLayer,
        commandIndex,
        extruding,
        feature,
        totals.featurePathCounts,
      );
    }
  } else {
    appendLinearSegment(
      segmentBuilder,
      start,
      end,
      segmentLayer,
      commandIndex,
      extruding,
      feature,
      totals.featurePathCounts,
    );
  }

  const timingDistance =
    movementDistance >
    POSITION_EPSILON
      ? movementDistance
      : Math.abs(
          extrusionAmount,
        );
  const commandDuration =
    estimateMotionSeconds(
      timingDistance,
      machine.feedRate *
        machine.speedMultiplier,
      extruding
        ? machine.printAcceleration
        : machine.travelAcceleration,
    );
  const featureIndex =
    getFeatureIndex(feature);

  if (
    movementDistance >
    POSITION_EPSILON
  ) {
    totals.featureDistances[
      featureIndex
    ] += movementDistance;

    if (extruding) {
      totals.extrusionDistanceMm +=
        movementDistance;
    } else {
      totals.travelDistanceMm +=
        movementDistance;
    }
  }

  totals.featureDurations[
    featureIndex
  ] += commandDuration;
  machine.position.x = end.x;
  machine.position.y = end.y;
  machine.position.z = end.z;
  machine.position.e = end.e;

  return commandDuration;
}
