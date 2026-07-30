import {
  GCODE_FEATURES,
  getFeatureCategory,
} from "../features";
import type {
  GcodeSegmentStore,
} from "../GcodeSegmentStore";
import type {
  GcodeFeatureStatistics,
} from "../../types/gcode";

export interface SegmentBounds {
  hasExtrudingSegments: boolean;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export function createFeatureBreakdown(
  pathCounts:
    Uint32Array<ArrayBufferLike>,
  distances:
    Float64Array<ArrayBufferLike>,
  durations:
    Float64Array<ArrayBufferLike>,
  durationScale: number,
): GcodeFeatureStatistics[] {
  let totalDistance = 0;

  for (
    let index = 0;
    index < distances.length;
    index++
  ) {
    totalDistance += distances[index];
  }

  return GCODE_FEATURES.map(
    (feature, index) => ({
      category: feature.id,
      pathCount: pathCounts[index],
      movementDistanceMm:
        distances[index],
      estimatedDurationSeconds:
        durations[index] *
        durationScale,
      movementPercentage:
        totalDistance > 0
          ? (
              distances[index] /
              totalDistance
            ) *
            100
          : 0,
    }),
  );
}

export function calculateSegmentBounds(
  segments: GcodeSegmentStore,
): SegmentBounds {
  let hasExtrudingSegments = false;

  for (
    let index = 0;
    index < segments.length;
    index++
  ) {
    if (
      getFeatureCategory(
        segments.featureIndexes[index],
      ) !== "travel"
    ) {
      hasExtrudingSegments = true;
      break;
    }
  }

  let minX =
    Number.POSITIVE_INFINITY;
  let maxX =
    Number.NEGATIVE_INFINITY;
  let minY =
    Number.POSITIVE_INFINITY;
  let maxY =
    Number.NEGATIVE_INFINITY;
  let minZ =
    Number.POSITIVE_INFINITY;
  let maxZ =
    Number.NEGATIVE_INFINITY;

  for (
    let index = 0;
    index < segments.length;
    index++
  ) {
    if (
      hasExtrudingSegments &&
      getFeatureCategory(
        segments.featureIndexes[index],
      ) === "travel"
    ) {
      continue;
    }

    const offset = index * 6;
    const startX =
      segments.coordinates[offset];
    const startY =
      segments.coordinates[
        offset + 1
      ];
    const startZ =
      segments.coordinates[
        offset + 2
      ];
    const endX =
      segments.coordinates[
        offset + 3
      ];
    const endY =
      segments.coordinates[
        offset + 4
      ];
    const endZ =
      segments.coordinates[
        offset + 5
      ];

    minX = Math.min(
      minX,
      startX,
      endX,
    );
    maxX = Math.max(
      maxX,
      startX,
      endX,
    );
    minY = Math.min(
      minY,
      startY,
      endY,
    );
    maxY = Math.max(
      maxY,
      startY,
      endY,
    );
    minZ = Math.min(
      minZ,
      startZ,
      endZ,
    );
    maxZ = Math.max(
      maxZ,
      startZ,
      endZ,
    );
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
    minZ = 0;
    maxZ = 0;
  }

  return {
    hasExtrudingSegments,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
  };
}
