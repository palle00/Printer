import {
  stripGcodeLine,
} from "../gcode/commandLine";
import {
  detectFeatureCategory,
  GCODE_FEATURES,
  getFeatureCategory,
  getFeatureIndex,
  type GcodeFeatureCategory,
} from "../gcode/features";
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
import {
  CumulativeTimeBuilder,
  DEFAULT_GCODE_ANALYSIS_PROFILE,
  estimateMotionSeconds,
  extractSlicerTimeMetadata,
  getEstimateConfidence,
  type GcodeAnalysisProfile,
  type SlicerTimeMetadata,
} from "../gcode/timeEstimation";
import type {
  GcodeFeatureStatistics,
  ParsedGcode,
} from "../types/gcode";

interface Position {
  x: number;
  y: number;
  z: number;
  e: number;
}

interface CommandParameters {
  x?: number;
  y?: number;
  z?: number;
  e?: number;
  i?: number;
  j?: number;
  r?: number;
  f?: number;
  s?: number;
  p?: number;
  t?: number;
}

interface ParsedCommand {
  command: string;
  parameters: CommandParameters;
}

interface ParseGcodeOptions {
  filePath?: string | null;
  fileSize?: number | null;
  profile?: Partial<GcodeAnalysisProfile>;
}

interface SlicerEstimateState {
  total: SlicerTimeMetadata | null;
  elapsedSeconds: number | null;
  remainingSeconds: number | null;
}

const EPSILON = 0.000001;

function parseCommand(
  commandText: string,
): ParsedCommand | null {
  if (!commandText || commandText === "%") {
    return null;
  }

  const commandMatch =
    commandText.match(
      /^([GMT])(\d+(?:\.\d+)?)/i,
    );

  if (!commandMatch) {
    return null;
  }

  const command = `${
    commandMatch[1].toUpperCase()
  }${Number(commandMatch[2])}`;
  const parameters:
    CommandParameters = {};
  const parameterRegex =
    /([A-Z])\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/gi;
  let match: RegExpExecArray | null;

  while (
    (match =
      parameterRegex.exec(
        commandText,
      )) !== null
  ) {
    const value = Number(match[2]);

    switch (
      match[1].toUpperCase()
    ) {
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
      case "F":
        parameters.f = value;
        break;
      case "S":
        parameters.s = value;
        break;
      case "P":
        parameters.p = value;
        break;
      case "T":
        parameters.t = value;
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

function appendLinearSegment(
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
      EPSILON ||
    Math.abs(end.y - start.y) >
      EPSILON ||
    Math.abs(end.z - start.z) >
      EPSILON;

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
  const chordLength =
    Math.hypot(dx, dy);
  const absoluteRadius =
    Math.abs(radius);

  if (
    chordLength < EPSILON ||
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

  if (radius < EPSILON) {
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

function appendArcSegments(
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

function updateSlicerEstimate(
  state: SlicerEstimateState,
  rawLine: string,
): void {
  const metadata =
    extractSlicerTimeMetadata(
      rawLine,
    );

  if (!metadata) {
    return;
  }

  if (metadata.kind === "total") {
    if (
      !state.total ||
      metadata.priority >
        state.total.priority
    ) {
      state.total = metadata;
    }
  } else if (
    metadata.kind === "elapsed"
  ) {
    state.elapsedSeconds =
      metadata.seconds;
  } else {
    state.remainingSeconds =
      metadata.seconds;
  }
}

function getPreferredSlicerSeconds(
  state: SlicerEstimateState,
): number | null {
  if (state.total) {
    return state.total.seconds;
  }

  if (
    state.elapsedSeconds !== null &&
    state.remainingSeconds !== null
  ) {
    return (
      state.elapsedSeconds +
      state.remainingSeconds
    );
  }

  return null;
}

function createFeatureBreakdown(
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

export function parseGcode(
  fileName: string,
  text: string,
  options: ParseGcodeOptions = {},
): ParsedGcode {
  const lines = text.split(/\r?\n/);
  const segmentBuilder =
    new GcodeSegmentStoreBuilder();
  const timelineBuilder =
    new CumulativeTimeBuilder();
  const profile = {
    ...DEFAULT_GCODE_ANALYSIS_PROFILE,
    ...options.profile,
  };
  const featurePathCounts =
    new Uint32Array(
      GCODE_FEATURES.length,
    );
  const featureDistances =
    new Float64Array(
      GCODE_FEATURES.length,
    );
  const featureDurations =
    new Float64Array(
      GCODE_FEATURES.length,
    );
  const slicerEstimate:
    SlicerEstimateState = {
      total: null,
      elapsedSeconds: null,
      remainingSeconds: null,
    };
  const layerMarkerMode =
    detectLayerMarkerMode(lines);
  const usesAutomaticLayers =
    layerMarkerMode === "none";
  const position: Position = {
    x: 0,
    y: 0,
    z: 0,
    e: 0,
  };

  let absolutePositioning = true;
  let absoluteExtrusion = true;
  let unitScale = 1;
  let speedMultiplier = 1;
  let feedRate =
    profile.defaultFeedRateMmPerMinute;
  let printAcceleration =
    profile.printAccelerationMmPerSecondSquared;
  let travelAcceleration =
    profile.travelAccelerationMmPerSecondSquared;
  let activeFeature:
    GcodeFeatureCategory =
      "unknown";
  let currentLayer =
    layerMarkerMode === "layer-change" ||
    layerMarkerMode === "z-comment"
      ? 0
      : 1;
  let highestLayer = 1;
  let lastAutomaticLayerZ:
    number | null = null;
  let filamentLengthMm = 0;
  let travelDistanceMm = 0;
  let extrusionDistanceMm = 0;
  let retractionCount = 0;
  let maximumHotendTemperature:
    number | null = null;
  let maximumBedTemperature:
    number | null = null;
  let heatingSeconds = 0;

  for (const rawLine of lines) {
    updateSlicerEstimate(
      slicerEstimate,
      rawLine,
    );

    const detectedFeature =
      detectFeatureCategory(rawLine);

    if (detectedFeature) {
      activeFeature =
        detectedFeature === "travel"
          ? "unknown"
          : detectedFeature;
    }

    currentLayer =
      updateCommentLayer(
        rawLine,
        layerMarkerMode,
        currentLayer,
      );
    highestLayer = Math.max(
      highestLayer,
      currentLayer,
    );

    const commandText =
      stripGcodeLine(rawLine);

    if (
      !commandText ||
      commandText === "%"
    ) {
      continue;
    }

    const commandIndex =
      timelineBuilder.commandCount +
      1;
    const parsed =
      parseCommand(commandText);
    let commandDuration = 0;

    if (!parsed) {
      timelineBuilder.append(0);
      continue;
    }

    const {
      command,
      parameters,
    } = parsed;

    if (
      parameters.f !== undefined &&
      parameters.f > 0
    ) {
      feedRate =
        parameters.f * unitScale;
    }

    if (command === "G20") {
      unitScale = 25.4;
    } else if (command === "G21") {
      unitScale = 1;
    } else if (command === "G90") {
      absolutePositioning = true;
    } else if (command === "G91") {
      absolutePositioning = false;
    } else if (command === "M82") {
      absoluteExtrusion = true;
    } else if (command === "M83") {
      absoluteExtrusion = false;
    } else if (command === "M220") {
      if (
        parameters.s !== undefined &&
        parameters.s > 0
      ) {
        speedMultiplier =
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
        printAcceleration =
          nextPrintAcceleration *
          unitScale;
      }

      if (
        parameters.t !== undefined &&
        parameters.t > 0
      ) {
        travelAcceleration =
          parameters.t *
          unitScale;
      }
    } else if (command === "G92") {
      if (parameters.x !== undefined) {
        position.x =
          parameters.x * unitScale;
      }
      if (parameters.y !== undefined) {
        position.y =
          parameters.y * unitScale;
      }
      if (parameters.z !== undefined) {
        position.z =
          parameters.z * unitScale;
      }
      if (parameters.e !== undefined) {
        position.e =
          parameters.e * unitScale;
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
        maximumHotendTemperature =
          Math.max(
            maximumHotendTemperature ??
              target,
            target,
          );
      }

      if (
        command === "M109" &&
        (target ?? 0) > 0
      ) {
        commandDuration =
          profile.nozzleHeatingWaitSeconds;
        heatingSeconds +=
          commandDuration;
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
        maximumBedTemperature =
          Math.max(
            maximumBedTemperature ??
              target,
            target,
          );
      }

      if (
        command === "M190" &&
        (target ?? 0) > 0
      ) {
        commandDuration =
          profile.bedHeatingWaitSeconds;
        heatingSeconds +=
          commandDuration;
      }
    } else if (command === "G4") {
      commandDuration =
        Math.max(
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
      commandDuration =
        profile.pauseSeconds;
    } else if (
      command === "M600"
    ) {
      commandDuration =
        profile.filamentChangeSeconds;
    } else if (
      command === "G0" ||
      command === "G1" ||
      command === "G2" ||
      command === "G3"
    ) {
      const start = {
        ...position,
      };
      const end: Position = {
        x:
          parameters.x ===
          undefined
            ? position.x
            : absolutePositioning
              ? parameters.x *
                unitScale
              : position.x +
                parameters.x *
                  unitScale,
        y:
          parameters.y ===
          undefined
            ? position.y
            : absolutePositioning
              ? parameters.y *
                unitScale
              : position.y +
                parameters.y *
                  unitScale,
        z:
          parameters.z ===
          undefined
            ? position.z
            : absolutePositioning
              ? parameters.z *
                unitScale
              : position.z +
                parameters.z *
                  unitScale,
        e:
          parameters.e ===
          undefined
            ? position.e
            : absoluteExtrusion
              ? parameters.e *
                unitScale
              : position.e +
                parameters.e *
                  unitScale,
      };
      const extrusionAmount =
        end.e - position.e;
      const extruding =
        extrusionAmount > EPSILON;

      if (extruding) {
        filamentLengthMm +=
          extrusionAmount;
      } else if (
        extrusionAmount < -EPSILON
      ) {
        retractionCount++;
      }

      if (
        usesAutomaticLayers &&
        extruding
      ) {
        if (
          lastAutomaticLayerZ ===
          null
        ) {
          lastAutomaticLayerZ =
            end.z;
        } else if (
          end.z >
          lastAutomaticLayerZ +
            0.01
        ) {
          currentLayer++;
          lastAutomaticLayerZ =
            end.z;
        }
      }

      const segmentLayer =
        Math.max(1, currentLayer);
      highestLayer = Math.max(
        highestLayer,
        segmentLayer,
      );
      const feature:
        GcodeFeatureCategory =
          extruding
            ? activeFeature
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
                unitScale,
            y:
              start.y +
              (parameters.j ?? 0) *
                unitScale,
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
                unitScale,
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
              featurePathCounts,
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
            featurePathCounts,
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
          featurePathCounts,
        );
      }

      const timingDistance =
        movementDistance > EPSILON
          ? movementDistance
          : Math.abs(
              extrusionAmount,
            );
      commandDuration =
        estimateMotionSeconds(
          timingDistance,
          feedRate *
            speedMultiplier,
          extruding
            ? printAcceleration
            : travelAcceleration,
        );
      const featureIndex =
        getFeatureIndex(feature);

      if (
        movementDistance >
        EPSILON
      ) {
        featureDistances[
          featureIndex
        ] += movementDistance;

        if (extruding) {
          extrusionDistanceMm +=
            movementDistance;
        } else {
          travelDistanceMm +=
            movementDistance;
        }
      }

      featureDurations[
        featureIndex
      ] += commandDuration;
      position.x = end.x;
      position.y = end.y;
      position.z = end.z;
      position.e = end.e;
    }

    timelineBuilder.append(
      commandDuration,
    );
  }

  const segments =
    segmentBuilder.finish();
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

  const slicerEstimateSeconds =
    getPreferredSlicerSeconds(
      slicerEstimate,
    );
  const motionTotalSeconds =
    timelineBuilder.totalSeconds;
  const totalSeconds =
    slicerEstimateSeconds ??
    motionTotalSeconds;
  const source =
    slicerEstimateSeconds !== null
      ? "slicer"
      : "motion";
  const confidence =
    getEstimateConfidence(
      source,
      totalSeconds,
    );
  const durationScale =
    motionTotalSeconds > 0
      ? totalSeconds /
        motionTotalSeconds
      : 1;
  const cumulativeSeconds =
    timelineBuilder.finish(
      slicerEstimateSeconds ??
        undefined,
    );
  const filamentRadius =
    profile.filamentDiameterMm / 2;
  const filamentVolumeCubicMm =
    Math.PI *
    filamentRadius *
    filamentRadius *
    filamentLengthMm;
  const filamentWeightGrams =
    (
      filamentVolumeCubicMm /
      1_000
    ) *
    profile
      .filamentDensityGramsPerCubicCentimeter;
  const width =
    hasExtrudingSegments
      ? Math.max(0, maxX - minX)
      : null;
  const depth =
    hasExtrudingSegments
      ? Math.max(0, maxY - minY)
      : null;
  const height =
    hasExtrudingSegments
      ? Math.max(0, maxZ - minZ)
      : null;

  return {
    fileName,
    filePath:
      options.filePath ?? null,
    fileSize:
      options.fileSize ?? null,
    lines,
    segments,
    statistics: {
      estimatedDurationSeconds:
        totalSeconds > 0
          ? totalSeconds
          : null,
      estimateSource: source,
      estimateConfidence:
        confidence,
      slicerEstimateSeconds,
      motionEstimateSeconds:
        motionTotalSeconds > 0
          ? motionTotalSeconds
          : null,
      heatingEstimateSeconds:
        heatingSeconds *
        durationScale,
      filamentLengthMm,
      filamentWeightGrams,
      widthMm: width,
      depthMm: depth,
      heightMm: height,
      travelDistanceMm,
      extrusionDistanceMm,
      retractionCount,
      maximumHotendTemperatureCelsius:
        maximumHotendTemperature,
      maximumBedTemperatureCelsius:
        maximumBedTemperature,
      featureBreakdown:
        createFeatureBreakdown(
          featurePathCounts,
          featureDistances,
          featureDurations,
          durationScale,
        ),
    },
    timing: {
      cumulativeSeconds,
      totalSeconds,
      motionTotalSeconds,
      heatingSeconds:
        heatingSeconds *
        durationScale,
      source,
      confidence,
    },
    totalLines: lines.length,
    totalLayers: Math.max(
      1,
      highestLayer,
    ),
    printableLines:
      cumulativeSeconds.length - 1,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
  };
}
