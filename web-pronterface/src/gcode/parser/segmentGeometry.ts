import {
  getFeatureIndex,
  type GcodeFeatureCategory,
} from "../features";
import type {
  GcodeSegmentStoreBuilder,
} from "../GcodeSegmentStore";
import type {
  Position,
} from "./parserTypes";

export const POSITION_EPSILON =
  0.000001;

export function appendLinearSegment(
  segments: GcodeSegmentStoreBuilder,
  start: Position,
  end: Position,
  layer: number,
  commandIndex: number,
  extruding: boolean,
  feature: GcodeFeatureCategory,
  featurePathCounts:
    Uint32Array<ArrayBufferLike>,
): boolean {
  const moved =
    Math.abs(end.x - start.x) >
      POSITION_EPSILON ||
    Math.abs(end.y - start.y) >
      POSITION_EPSILON ||
    Math.abs(end.z - start.z) >
      POSITION_EPSILON;

  if (!moved) {
    return false;
  }

  segments.append(
    start.x,
    start.y,
    start.z,
    end.x,
    end.y,
    end.z,
    layer,
    commandIndex,
    extruding,
    feature,
  );
  featurePathCounts[
    getFeatureIndex(feature)
  ]++;
  return true;
}

export function getArcCenterFromRadius(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  radius: number,
  clockwise: boolean,
): { x: number; y: number } | null {
  const dx = endX - startX;
  const dy = endY - startY;
  const chordLength =
    Math.hypot(dx, dy);
  const absoluteRadius =
    Math.abs(radius);

  if (
    chordLength <
      POSITION_EPSILON ||
    chordLength >
      absoluteRadius * 2
  ) {
    return null;
  }

  const midpointX =
    (startX + endX) / 2;
  const midpointY =
    (startY + endY) / 2;
  const distanceFromMidpoint =
    Math.sqrt(
      Math.max(
        0,
        absoluteRadius *
          absoluteRadius -
          (
            chordLength *
            chordLength
          ) /
            4,
      ),
    );
  const perpendicularX =
    -dy / chordLength;
  const perpendicularY =
    dx / chordLength;
  let direction =
    clockwise ? -1 : 1;

  if (radius < 0) {
    direction *= -1;
  }

  return {
    x:
      midpointX +
      perpendicularX *
        distanceFromMidpoint *
        direction,
    y:
      midpointY +
      perpendicularY *
        distanceFromMidpoint *
        direction,
  };
}

function normalizeArcSweep(
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
): number {
  let sweep =
    endAngle - startAngle;

  if (clockwise) {
    while (sweep >= 0) {
      sweep -= Math.PI * 2;
    }
  } else {
    while (sweep <= 0) {
      sweep += Math.PI * 2;
    }
  }

  return sweep;
}

function getArcGeometry(
  start: Position,
  end: Position,
  centerX: number,
  centerY: number,
  clockwise: boolean,
): {
  radius: number;
  startAngle: number;
  sweep: number;
  distance: number;
} | null {
  const radius = Math.hypot(
    start.x - centerX,
    start.y - centerY,
  );

  if (radius < POSITION_EPSILON) {
    return null;
  }

  const startAngle = Math.atan2(
    start.y - centerY,
    start.x - centerX,
  );
  const endAngle = Math.atan2(
    end.y - centerY,
    end.x - centerX,
  );
  const sweep =
    normalizeArcSweep(
      startAngle,
      endAngle,
      clockwise,
    );
  const planarDistance =
    Math.abs(sweep * radius);

  return {
    radius,
    startAngle,
    sweep,
    distance: Math.hypot(
      planarDistance,
      end.z - start.z,
    ),
  };
}

export function appendArcSegments(
  segments: GcodeSegmentStoreBuilder,
  start: Position,
  end: Position,
  centerX: number,
  centerY: number,
  clockwise: boolean,
  layer: number,
  commandIndex: number,
  extruding: boolean,
  feature: GcodeFeatureCategory,
  featurePathCounts:
    Uint32Array<ArrayBufferLike>,
): number {
  const geometry =
    getArcGeometry(
      start,
      end,
      centerX,
      centerY,
      clockwise,
    );

  if (!geometry) {
    appendLinearSegment(
      segments,
      start,
      end,
      layer,
      commandIndex,
      extruding,
      feature,
      featurePathCounts,
    );
    return Math.hypot(
      end.x - start.x,
      end.y - start.y,
      end.z - start.z,
    );
  }

  const arcSegmentCount =
    Math.max(
      8,
      Math.min(
        200,
        Math.ceil(
          geometry.distance / 1.5,
        ),
      ),
    );
  let previous = {
    ...start,
  };

  for (
    let index = 1;
    index <= arcSegmentCount;
    index++
  ) {
    const progress =
      index / arcSegmentCount;
    const angle =
      geometry.startAngle +
      geometry.sweep * progress;
    const next: Position = {
      x:
        centerX +
        Math.cos(angle) *
          geometry.radius,
      y:
        centerY +
        Math.sin(angle) *
          geometry.radius,
      z:
        start.z +
        (end.z - start.z) *
          progress,
      e:
        start.e +
        (end.e - start.e) *
          progress,
    };

    if (
      index === arcSegmentCount
    ) {
      next.x = end.x;
      next.y = end.y;
      next.z = end.z;
      next.e = end.e;
    }

    appendLinearSegment(
      segments,
      previous,
      next,
      layer,
      commandIndex,
      extruding,
      feature,
      featurePathCounts,
    );
    previous = next;
  }

  return geometry.distance;
}
