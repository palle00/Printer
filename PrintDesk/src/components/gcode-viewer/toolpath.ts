import type { ParsedGcode } from "../../types/gcode";

const BUILD_CHUNK_SIZE = 8_000;
const MINIMUM_SEGMENT_LENGTH = 0.0001;

export const DEFAULT_EXTRUSION_WIDTH = 0.4;
export const PRINTED_FILAMENT_RADIUS = DEFAULT_EXTRUSION_WIDTH / 2;

export interface SceneLayout {
  centerX: number;
  centerY: number;
  minZ: number;
  bedWidth: number;
  bedDepth: number;
  modelHeight: number;
}

export interface ToolpathData {
  positions: Float32Array<ArrayBufferLike>;
  commandIndexes: Float32Array<ArrayBufferLike>;
  categoryIndexes: Uint8Array<ArrayBufferLike>;
  indices: Uint32Array<ArrayBufferLike>;
  layerIndexOffsets: Uint32Array<ArrayBufferLike>;
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

  const minimumBedX = Math.min(0, gcode.minX - 10);
  const maximumBedX = Math.max(220, gcode.maxX + 10);
  const minimumBedY = Math.min(0, gcode.minY - 10);
  const maximumBedY = Math.max(220, gcode.maxY + 10);

  return {
    centerX: (minimumBedX + maximumBedX) / 2,
    centerY: (minimumBedY + maximumBedY) / 2,
    minZ: gcode.minZ,
    bedWidth: maximumBedX - minimumBedX,
    bedDepth: maximumBedY - minimumBedY,
    modelHeight: Math.max(1, gcode.maxZ - gcode.minZ),
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Preview build aborted", "AbortError");
  }
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function isFiniteSegment(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
): boolean {
  return (
    Number.isFinite(startX) &&
    Number.isFinite(startY) &&
    Number.isFinite(startZ) &&
    Number.isFinite(endX) &&
    Number.isFinite(endY) &&
    Number.isFinite(endZ) &&
    Math.hypot(endX - startX, endY - startY, endZ - startZ) >=
      MINIMUM_SEGMENT_LENGTH
  );
}

function buildOffsets(
  counts: Uint32Array<ArrayBufferLike>,
  valuesPerItem: number,
): Uint32Array<ArrayBufferLike> {
  const offsets = new Uint32Array(counts.length);
  let offset = 0;

  for (let layer = 1; layer < counts.length; layer++) {
    offset += counts[layer] * valuesPerItem;
    offsets[layer] = offset;
  }

  return offsets;
}

export async function buildToolpathData(
  gcode: ParsedGcode,
  signal: AbortSignal,
  onProgress?: (percent: number) => void,
): Promise<ToolpathData> {
  const layerCount = Math.max(1, gcode.totalLayers) + 1;
  const layerCounts = new Uint32Array(layerCount);
  let segmentCount = 0;

  for (let sourceIndex = 0; sourceIndex < gcode.segments.length; sourceIndex++) {
    const coordinateOffset = sourceIndex * 6;
    const coordinates = gcode.segments.coordinates;
    const layer = Math.min(
      layerCount - 1,
      Math.max(1, gcode.segments.layers[sourceIndex]),
    );

    if (
      isFiniteSegment(
        coordinates[coordinateOffset],
        coordinates[coordinateOffset + 1],
        coordinates[coordinateOffset + 2],
        coordinates[coordinateOffset + 3],
        coordinates[coordinateOffset + 4],
        coordinates[coordinateOffset + 5],
      )
    ) {
      segmentCount++;
      layerCounts[layer]++;
    }

    if ((sourceIndex + 1) % BUILD_CHUNK_SIZE === 0) {
      throwIfAborted(signal);
      onProgress?.(
        Math.round(((sourceIndex + 1) / gcode.segments.length) * 20),
      );
      await waitForNextFrame();
    }
  }

  throwIfAborted(signal);

  const commandIndexes = new Float32Array(gcode.segments.length * 2);
  const categoryIndexes = new Uint8Array(gcode.segments.length * 2);
  const indices = new Uint32Array(segmentCount * 2);
  const layerIndexOffsets = buildOffsets(layerCounts, 2);
  let output = 0;
  let lastReportedPercent = 20;

  for (let sourceIndex = 0; sourceIndex < gcode.segments.length; sourceIndex++) {
    const sourceOffset = sourceIndex * 6;
    const coordinates = gcode.segments.coordinates;
    const startX = coordinates[sourceOffset];
    const startY = coordinates[sourceOffset + 1];
    const startZ = coordinates[sourceOffset + 2];
    const endX = coordinates[sourceOffset + 3];
    const endY = coordinates[sourceOffset + 4];
    const endZ = coordinates[sourceOffset + 5];

    if (
      !isFiniteSegment(
        startX,
        startY,
        startZ,
        endX,
        endY,
        endZ,
      )
    ) {
      continue;
    }

    const vertexIndex = sourceIndex * 2;
    const commandIndex = gcode.segments.commandIndexes[sourceIndex];
    const categoryIndex = gcode.segments.featureIndexes[sourceIndex];
    commandIndexes[vertexIndex] = commandIndex;
    commandIndexes[vertexIndex + 1] = commandIndex;
    categoryIndexes[vertexIndex] = categoryIndex;
    categoryIndexes[vertexIndex + 1] = categoryIndex;
    const offset = output * 2;
    indices[offset] = vertexIndex;
    indices[offset + 1] = vertexIndex + 1;
    output++;

    if (
      (sourceIndex + 1) % BUILD_CHUNK_SIZE === 0 ||
      sourceIndex + 1 === gcode.segments.length
    ) {
      throwIfAborted(signal);
      const percent =
        20 +
        Math.round(((sourceIndex + 1) / gcode.segments.length) * 80);

      if (percent !== lastReportedPercent) {
        lastReportedPercent = percent;
        onProgress?.(percent);
      }

      await waitForNextFrame();
    }
  }

  throwIfAborted(signal);
  onProgress?.(100);

  return {
    positions: gcode.segments.coordinates,
    commandIndexes,
    categoryIndexes,
    indices,
    layerIndexOffsets,
  };
}
