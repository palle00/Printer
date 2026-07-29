import * as THREE from "three";
import type { ParsedGcode } from "../../types/gcode";

export const PLANNED_FILAMENT_RADIUS = 0.22;
export const PRINTED_FILAMENT_RADIUS = 0.28;

const SEGMENT_OVERLAP = 0.12;
const BUILD_CHUNK_SIZE = 8_000;
const MINIMUM_SEGMENT_LENGTH = 0.0001;

export interface SceneLayout {
  centerX: number;
  centerY: number;
  minZ: number;
  bedWidth: number;
  bedDepth: number;
  modelHeight: number;
}

export interface ToolpathData {
  matrices: Float32Array;
  layers: Uint32Array;
  commands: Uint32Array;
  count: number;
}

export function getSceneLayout(
  gcode: ParsedGcode | null,
): SceneLayout {
  if (!gcode) {
    return {
      centerX: 110,
      centerY: 110,
      minZ: 0,
      bedWidth: 220,
      bedDepth: 220,
      modelHeight: 20,
    };
  }

  const minimumBedX = Math.min(
    0,
    gcode.minX - 10,
  );

  const maximumBedX = Math.max(
    220,
    gcode.maxX + 10,
  );

  const minimumBedY = Math.min(
    0,
    gcode.minY - 10,
  );

  const maximumBedY = Math.max(
    220,
    gcode.maxY + 10,
  );

  return {
    centerX:
      (minimumBedX + maximumBedX) / 2,

    centerY:
      (minimumBedY + maximumBedY) / 2,

    minZ: gcode.minZ,

    bedWidth:
      maximumBedX - minimumBedX,

    bedDepth:
      maximumBedY - minimumBedY,

    modelHeight: Math.max(
      1,
      gcode.maxZ - gcode.minZ,
    ),
  };
}

export function upperBound(
  values: ArrayLike<number>,
  target: number,
): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = Math.floor(
      (low + high) / 2,
    );

    if (values[middle] <= target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function throwIfAborted(
  signal: AbortSignal,
): void {
  if (signal.aborted) {
    throw new DOMException(
      "Preview build aborted",
      "AbortError",
    );
  }
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

export async function buildToolpathData(
  gcode: ParsedGcode,
  layout: SceneLayout,
  signal: AbortSignal,
  onProgress?: (percent: number) => void,
): Promise<ToolpathData> {
  let extrusionCount = 0;

  for (const segment of gcode.segments) {
    if (segment.extruding) {
      extrusionCount++;
    }
  }

  const matrices = new Float32Array(
    extrusionCount * 16,
  );

  const layers = new Uint32Array(
    extrusionCount,
  );

  const commands = new Uint32Array(
    extrusionCount,
  );

  const up = new THREE.Vector3(
    0,
    1,
    0,
  );

  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion =
    new THREE.Quaternion();
  const matrix = new THREE.Matrix4();

  /*
   * Both meshes share this matrix buffer.
   * Using the larger radius keeps the orange
   * printed path correctly positioned.
   */
  const verticalOffset =
    PRINTED_FILAMENT_RADIUS;

  let outputIndex = 0;
  let lastReportedPercent = -1;

  for (
    let sourceIndex = 0;
    sourceIndex < gcode.segments.length;
    sourceIndex++
  ) {
    throwIfAborted(signal);

    const segment =
      gcode.segments[sourceIndex];

    if (!segment.extruding) {
      continue;
    }

    start.set(
      segment.start.x -
        layout.centerX,

      segment.start.z -
        layout.minZ +
        verticalOffset,

      layout.centerY -
        segment.start.y,
    );

    end.set(
      segment.end.x -
        layout.centerX,

      segment.end.z -
        layout.minZ +
        verticalOffset,

      layout.centerY -
        segment.end.y,
    );

    direction.subVectors(
      end,
      start,
    );

    const measuredLength =
      direction.length();

    const segmentLength = Math.max(
      MINIMUM_SEGMENT_LENGTH,
      measuredLength,
    );

    midpoint
      .copy(start)
      .add(end)
      .multiplyScalar(0.5);

    if (
      measuredLength <
      MINIMUM_SEGMENT_LENGTH
    ) {
      direction.copy(up);
    } else {
      direction.multiplyScalar(
        1 / measuredLength,
      );
    }

    quaternion.setFromUnitVectors(
      up,
      direction,
    );

    scale.set(
      1,
      segmentLength +
        SEGMENT_OVERLAP,
      1,
    );

    matrix.compose(
      midpoint,
      quaternion,
      scale,
    );

    matrix.toArray(
      matrices,
      outputIndex * 16,
    );

    layers[outputIndex] =
      segment.layer;

    commands[outputIndex] =
      segment.commandIndex;

    outputIndex++;

    if (
      outputIndex %
        BUILD_CHUNK_SIZE ===
        0 ||
      outputIndex === extrusionCount
    ) {
      const percent =
        extrusionCount === 0
          ? 100
          : Math.round(
              (outputIndex /
                extrusionCount) *
                100,
            );

      if (
        percent !==
        lastReportedPercent
      ) {
        lastReportedPercent = percent;
        onProgress?.(percent);
      }

      await waitForNextFrame();
    }
  }

  throwIfAborted(signal);

  return {
    matrices,
    layers,
    commands,
    count: outputIndex,
  };
}