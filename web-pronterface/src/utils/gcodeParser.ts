import type {
  ParsedGcode,
} from "../types/gcode";

import {
  GcodeSegmentStoreBuilder,
} from "../gcode/GcodeSegmentStore";

import {
  detectLayerMarkerMode,
  getNumberedLayer,
  isLayerChangeMarker,
  isZCommentMarker,
  type LayerMarkerMode,
} from "../gcode/layerMarkers";

interface Position {
  x: number;
  y: number;
  z: number;
  e: number;
}

interface ParsedCommand {
  command: string;
  parameters: {
    x?: number;
    y?: number;
    z?: number;
    e?: number;
    i?: number;
    j?: number;
    r?: number;
  };
}

const EPSILON = 0.000001;

function removeCommentsAndMetadata(line: string): string {
  return line
    .replace(/\([^)]*\)/g, "")
    .split(";")[0]
    .split("*")[0]
    .trim();
}

function parseCommand(rawLine: string): ParsedCommand | null {
  let line = removeCommentsAndMetadata(rawLine);

  if (!line || line === "%") {
    return null;
  }

  line = line.replace(/^N\d+\s*/i, "").trim();

  const commandMatch = line.match(
    /^([GMT]\d+(?:\.\d+)?)/i,
  );

  if (!commandMatch) {
    return null;
  }

  const command = commandMatch[1].toUpperCase();
  const parameters: ParsedCommand["parameters"] = {};

  const parameterRegex =
    /([A-Z])\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/gi;

  let match: RegExpExecArray | null;

  while ((match = parameterRegex.exec(line)) !== null) {
    const value = Number(match[2]);

    switch (match[1].toUpperCase()) {
      case "X":
        parameters.x = value;
        break;
      case "Y":
        parameters.y = value;
        break;
      case "Z":
        parameters.z = value;
        break;
      case "E":
        parameters.e = value;
        break;
      case "I":
        parameters.i = value;
        break;
      case "J":
        parameters.j = value;
        break;
      case "R":
        parameters.r = value;
        break;
    }
  }

  return {
    command,
    parameters,
  };
}

function updateCommentLayer(
  rawLine: string,
  mode: LayerMarkerMode,
  currentLayer: number,
): number {
  if (mode === "numbered") {
    const numberedLayer =
      getNumberedLayer(rawLine);

    if (numberedLayer !== null) {
      return Math.max(
        1,
        numberedLayer,
      );
    }
  }

  if (
    mode === "layer-change" &&
    isLayerChangeMarker(rawLine)
  ) {
    return currentLayer + 1;
  }

  if (
    mode === "z-comment" &&
    isZCommentMarker(rawLine)
  ) {
    return currentLayer + 1;
  }

  return currentLayer;
}

function addLinearSegment(
  segments: GcodeSegmentStoreBuilder,
  start: Position,
  end: Position,
  layer: number,
  commandIndex: number,
  extruding: boolean,
): void {
  const moved =
    Math.abs(end.x - start.x) > EPSILON ||
    Math.abs(end.y - start.y) > EPSILON ||
    Math.abs(end.z - start.z) > EPSILON;

  if (!moved) {
    return;
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
  );
}

function getArcCenterFromRadius(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  radius: number,
  clockwise: boolean,
): { x: number; y: number } | null {
  const dx = endX - startX;
  const dy = endY - startY;
  const chordLength = Math.hypot(dx, dy);
  const absoluteRadius = Math.abs(radius);

  if (
    chordLength < EPSILON ||
    chordLength > absoluteRadius * 2
  ) {
    return null;
  }

  const midpointX = (startX + endX) / 2;
  const midpointY = (startY + endY) / 2;

  const distanceFromMidpoint = Math.sqrt(
    Math.max(
      0,
      absoluteRadius * absoluteRadius -
        (chordLength * chordLength) / 4,
    ),
  );

  const perpendicularX = -dy / chordLength;
  const perpendicularY = dx / chordLength;

  let direction = clockwise ? -1 : 1;

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
  let sweep = endAngle - startAngle;

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

function addArcSegments(
  segments: GcodeSegmentStoreBuilder,
  start: Position,
  end: Position,
  centerX: number,
  centerY: number,
  clockwise: boolean,
  layer: number,
  commandIndex: number,
  extruding: boolean,
): void {
  const radius = Math.hypot(
    start.x - centerX,
    start.y - centerY,
  );

  if (radius < EPSILON) {
    addLinearSegment(
      segments,
      start,
      end,
      layer,
      commandIndex,
      extruding,
    );

    return;
  }

  const startAngle = Math.atan2(
    start.y - centerY,
    start.x - centerX,
  );

  const endAngle = Math.atan2(
    end.y - centerY,
    end.x - centerX,
  );

  const sweep = normalizeArcSweep(
    startAngle,
    endAngle,
    clockwise,
  );

  const arcLength = Math.abs(
    sweep * radius,
  );

  const arcSegmentCount = Math.max(
    8,
    Math.min(
      200,
      Math.ceil(arcLength / 1.5),
    ),
  );

  let previous = { ...start };

  for (
    let index = 1;
    index <= arcSegmentCount;
    index++
  ) {
    const progress =
      index / arcSegmentCount;

    const angle =
      startAngle + sweep * progress;

    const next: Position = {
      x:
        centerX +
        Math.cos(angle) * radius,

      y:
        centerY +
        Math.sin(angle) * radius,

      z:
        start.z +
        (end.z - start.z) * progress,

      e:
        start.e +
        (end.e - start.e) * progress,
    };

    if (index === arcSegmentCount) {
      next.x = end.x;
      next.y = end.y;
      next.z = end.z;
      next.e = end.e;
    }

    addLinearSegment(
      segments,
      previous,
      next,
      layer,
      commandIndex,
      extruding,
    );

    previous = next;
  }
}

export function parseGcode(
  fileName: string,
  text: string,
): ParsedGcode {
  const lines = text.split(/\r?\n/);
  const segmentBuilder =
    new GcodeSegmentStoreBuilder();

  const layerMarkerMode =
    detectLayerMarkerMode(lines);
  const usesAutomaticLayers =
    layerMarkerMode === "none";

  let absolutePositioning = true;
  let absoluteExtrusion = true;
  let unitScale = 1;

  let currentLayer =
    layerMarkerMode === "layer-change" ||
    layerMarkerMode === "z-comment"
      ? 0
      : 1;

  let highestLayer = 1;
  let printableLines = 0;

  let lastAutomaticLayerZ:
    | number
    | null = null;

  const position: Position = {
    x: 0,
    y: 0,
    z: 0,
    e: 0,
  };

  for (const rawLine of lines) {
    currentLayer = updateCommentLayer(
      rawLine,
      layerMarkerMode,
      currentLayer,
    );

    highestLayer = Math.max(
      highestLayer,
      currentLayer,
    );

    const parsed = parseCommand(rawLine);

    if (!parsed) {
      continue;
    }

    printableLines++;

    const commandIndex = printableLines;
    const { command, parameters } = parsed;

    switch (command) {
      case "G20": {
        unitScale = 25.4;
        continue;
      }

      case "G21": {
        unitScale = 1;
        continue;
      }

      case "G90": {
        absolutePositioning = true;
        continue;
      }

      case "G91": {
        absolutePositioning = false;
        continue;
      }

      case "M82": {
        absoluteExtrusion = true;
        continue;
      }

      case "M83": {
        absoluteExtrusion = false;
        continue;
      }

      case "G92": {
        const { x, y, z, e } = parameters;

        if (x !== undefined) {
          position.x = x * unitScale;
        }

        if (y !== undefined) {
          position.y = y * unitScale;
        }

        if (z !== undefined) {
          position.z = z * unitScale;
        }

        if (e !== undefined) {
          position.e = e * unitScale;
        }

        continue;
      }
    }

    const isLinear =
      command === "G0" ||
      command === "G00" ||
      command === "G1" ||
      command === "G01";

    const isClockwiseArc =
      command === "G2" ||
      command === "G02";

    const isCounterClockwiseArc =
      command === "G3" ||
      command === "G03";

    if (
      !isLinear &&
      !isClockwiseArc &&
      !isCounterClockwiseArc
    ) {
      continue;
    }

    const start = { ...position };

    const xParameter =
      parameters.x;

    const yParameter =
      parameters.y;

    const zParameter =
      parameters.z;

    const eParameter =
      parameters.e;

    const end: Position = {
      x:
        xParameter === undefined
          ? position.x
          : absolutePositioning
            ? xParameter * unitScale
            : position.x +
              xParameter * unitScale,

      y:
        yParameter === undefined
          ? position.y
          : absolutePositioning
            ? yParameter * unitScale
            : position.y +
              yParameter * unitScale,

      z:
        zParameter === undefined
          ? position.z
          : absolutePositioning
            ? zParameter * unitScale
            : position.z +
              zParameter * unitScale,

      e:
        eParameter === undefined
          ? position.e
          : absoluteExtrusion
            ? eParameter * unitScale
            : position.e +
              eParameter * unitScale,
    };

    const extrusionAmount =
      end.e - position.e;

    const extruding =
      extrusionAmount > EPSILON;

    if (
      usesAutomaticLayers &&
      extruding
    ) {
      if (lastAutomaticLayerZ === null) {
        lastAutomaticLayerZ = end.z;
      } else if (
        end.z >
        lastAutomaticLayerZ + 0.01
      ) {
        currentLayer++;

        highestLayer = Math.max(
          highestLayer,
          currentLayer,
        );

        lastAutomaticLayerZ = end.z;
      }
    }

    const segmentLayer = Math.max(
      1,
      currentLayer,
    );

    highestLayer = Math.max(
      highestLayer,
      segmentLayer,
    );

    if (isLinear) {
      addLinearSegment(
        segmentBuilder,
        start,
        end,
        segmentLayer,
        commandIndex,
        extruding,
      );
    } else {
      const iParameter =
        parameters.i;

      const jParameter =
        parameters.j;

      const radiusParameter =
        parameters.r;

      let center:
        | { x: number; y: number }
        | null = null;

      if (
        iParameter !== undefined ||
        jParameter !== undefined
      ) {
        center = {
          x:
            start.x +
            (iParameter ?? 0) *
              unitScale,

          y:
            start.y +
            (jParameter ?? 0) *
              unitScale,
        };
      } else if (
        radiusParameter !== undefined
      ) {
        center = getArcCenterFromRadius(
          start.x,
          start.y,
          end.x,
          end.y,
          radiusParameter * unitScale,
          isClockwiseArc,
        );
      }

      if (center) {
        addArcSegments(
          segmentBuilder,
          start,
          end,
          center.x,
          center.y,
          isClockwiseArc,
          segmentLayer,
          commandIndex,
          extruding,
        );
      } else {
        addLinearSegment(
          segmentBuilder,
          start,
          end,
          segmentLayer,
          commandIndex,
          extruding,
        );
      }
    }

    position.x = end.x;
    position.y = end.y;
    position.z = end.z;
    position.e = end.e;
  }

  const segments =
    segmentBuilder.finish();
  let hasExtrudingSegments = false;

  for (let index = 0; index < segments.length; index++) {
    if (segments.extruding[index] !== 0) {
      hasExtrudingSegments = true;
      break;
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < segments.length; index++) {
    if (
      hasExtrudingSegments &&
      segments.extruding[index] === 0
    ) {
      continue;
    }

    const offset = index * 6;
    const startX = segments.coordinates[offset];
    const startY = segments.coordinates[offset + 1];
    const startZ = segments.coordinates[offset + 2];
    const endX = segments.coordinates[offset + 3];
    const endY = segments.coordinates[offset + 4];
    const endZ = segments.coordinates[offset + 5];

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
    fileName,
    lines,
    segments,
    totalLines: lines.length,
    totalLayers: Math.max(
      1,
      highestLayer,
    ),
    printableLines,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
  };
}
