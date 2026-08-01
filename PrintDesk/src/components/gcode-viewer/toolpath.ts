import type { ParsedGcode } from "../../types/gcode";

const BUILD_CHUNK_SIZE = 25_000;
const MAX_PREVIEW_SEGMENTS = 40_000;
const MINIMUM_SEGMENT_LENGTH = 0.0001;
const CONTINUITY_TOLERANCE_SQUARED = 0.000001;

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
  layerVertexOffsets: Uint32Array<ArrayBufferLike>;
  sourceSegmentCount: number;
}

interface WalkOptions {
  stride: number;
  signal: AbortSignal;
  progressStart: number;
  progressEnd: number;
  onProgress?: (percent: number) => void;
  onSegment(
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    startCommandIndex: number,
    endCommandIndex: number,
    layer: number,
    categoryIndex: number,
  ): void;
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

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
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

function pointsConnect(
  endX: number,
  endY: number,
  endZ: number,
  startX: number,
  startY: number,
  startZ: number,
): boolean {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const deltaZ = endZ - startZ;

  return (
    deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ <=
    CONTINUITY_TOLERANCE_SQUARED
  );
}

async function walkPreviewSegments(
  gcode: ParsedGcode,
  options: WalkOptions,
): Promise<void> {
  const { coordinates, commandIndexes, featureIndexes, layers } =
    gcode.segments;
  const sourceCount = gcode.segments.length;
  let hasGroup = false;
  let groupSize = 0;
  let groupStartX = 0;
  let groupStartY = 0;
  let groupStartZ = 0;
  let groupEndX = 0;
  let groupEndY = 0;
  let groupEndZ = 0;
  let groupStartCommandIndex = 0;
  let groupEndCommandIndex = 0;
  let groupLayer = 1;
  let groupCategoryIndex = 0;
  let lastProgress = -1;

  const flush = (): void => {
    if (hasGroup) {
      options.onSegment(
        groupStartX,
        groupStartY,
        groupStartZ,
        groupEndX,
        groupEndY,
        groupEndZ,
        groupStartCommandIndex,
        groupEndCommandIndex,
        groupLayer,
        groupCategoryIndex,
      );
      hasGroup = false;
      groupSize = 0;
    }
  };

  for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex++) {
    const offset = sourceIndex * 6;
    const startX = coordinates[offset];
    const startY = coordinates[offset + 1];
    const startZ = coordinates[offset + 2];
    const endX = coordinates[offset + 3];
    const endY = coordinates[offset + 4];
    const endZ = coordinates[offset + 5];

    if (
      !isFiniteSegment(startX, startY, startZ, endX, endY, endZ)
    ) {
      flush();
      continue;
    }

    const layer = Math.min(
      Math.max(1, gcode.totalLayers),
      Math.max(1, layers[sourceIndex]),
    );
    const categoryIndex = featureIndexes[sourceIndex];
    const commandIndex = commandIndexes[sourceIndex];
    const canExtend =
      hasGroup &&
      groupSize < options.stride &&
      groupLayer === layer &&
      groupCategoryIndex === categoryIndex &&
      pointsConnect(
        groupEndX,
        groupEndY,
        groupEndZ,
        startX,
        startY,
        startZ,
      );

    if (canExtend) {
      groupEndX = endX;
      groupEndY = endY;
      groupEndZ = endZ;
      groupEndCommandIndex = commandIndex;
      groupSize++;
    } else {
      flush();
      hasGroup = true;
      groupStartX = startX;
      groupStartY = startY;
      groupStartZ = startZ;
      groupEndX = endX;
      groupEndY = endY;
      groupEndZ = endZ;
      groupStartCommandIndex = commandIndex;
      groupEndCommandIndex = commandIndex;
      groupLayer = layer;
      groupCategoryIndex = categoryIndex;
      groupSize = 1;
    }

    if (
      (sourceIndex + 1) % BUILD_CHUNK_SIZE === 0 ||
      sourceIndex + 1 === sourceCount
    ) {
      throwIfAborted(options.signal);
      const progress = Math.round(
        options.progressStart +
          ((sourceIndex + 1) / Math.max(1, sourceCount)) *
            (options.progressEnd - options.progressStart),
      );

      if (progress !== lastProgress) {
        lastProgress = progress;
        options.onProgress?.(progress);
      }

      await yieldToMainThread();
    }
  }

  flush();
  throwIfAborted(options.signal);
}

function buildLayerVertexOffsets(
  layerCounts: Uint32Array<ArrayBufferLike>,
): Uint32Array<ArrayBufferLike> {
  const offsets = new Uint32Array(layerCounts.length);
  let offset = 0;

  for (let layer = 1; layer < layerCounts.length; layer++) {
    offset += layerCounts[layer] * 2;
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
  const stride = Math.max(
    1,
    Math.ceil(gcode.segments.length / MAX_PREVIEW_SEGMENTS),
  );
  let segmentCount = 0;

  await walkPreviewSegments(gcode, {
    stride,
    signal,
    progressStart: 0,
    progressEnd: 35,
    onProgress,
    onSegment(
      _startX,
      _startY,
      _startZ,
      _endX,
      _endY,
      _endZ,
      _startCommandIndex,
      _endCommandIndex,
      layer,
    ) {
      segmentCount++;
      layerCounts[layer]++;
    },
  });

  const positions = new Float32Array(segmentCount * 6);
  const commandIndexes = new Float32Array(segmentCount * 2);
  const categoryIndexes = new Uint8Array(segmentCount * 2);
  let outputIndex = 0;

  await walkPreviewSegments(gcode, {
    stride,
    signal,
    progressStart: 35,
    progressEnd: 100,
    onProgress,
    onSegment(
      startX,
      startY,
      startZ,
      endX,
      endY,
      endZ,
      startCommandIndex,
      endCommandIndex,
      _layer,
      categoryIndex,
    ) {
      const positionOffset = outputIndex * 6;
      const vertexOffset = outputIndex * 2;
      positions[positionOffset] = startX;
      positions[positionOffset + 1] = startY;
      positions[positionOffset + 2] = startZ;
      positions[positionOffset + 3] = endX;
      positions[positionOffset + 4] = endY;
      positions[positionOffset + 5] = endZ;
      commandIndexes[vertexOffset] = startCommandIndex;
      commandIndexes[vertexOffset + 1] = endCommandIndex;
      categoryIndexes[vertexOffset] = categoryIndex;
      categoryIndexes[vertexOffset + 1] = categoryIndex;
      outputIndex++;
    },
  });

  onProgress?.(100);

  return {
    positions,
    commandIndexes,
    categoryIndexes,
    layerVertexOffsets: buildLayerVertexOffsets(layerCounts),
    sourceSegmentCount: gcode.segments.length,
  };
}
