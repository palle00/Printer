import {
  stripGcodeLine,
} from "../commandLine";
import {
  detectFeatureCategory,
  GCODE_FEATURES,
} from "../features";
import {
  GcodeSegmentStore,
  GcodeSegmentStoreBuilder,
  type GcodeSegmentSink,
} from "../GcodeSegmentStore";
import {
  detectLayerMarkerMode,
} from "../layerMarkers";
import {
  CumulativeTimeBuilder,
  DEFAULT_GCODE_ANALYSIS_PROFILE,
  getEstimateConfidence,
  type GcodeAnalysisProfile,
} from "../timeEstimation";
import type {
  ParsedGcode,
} from "../../types/gcode";
import {
  parseCommand,
} from "./commandParser";
import {
  processParsedCommand,
} from "./commandProcessor";
import {
  updateCommentLayer,
} from "./layerTracking";
import {
  calculateSegmentBounds,
  createFeatureBreakdown,
} from "./parserStatistics";
import type {
  ParseGcodeOptions,
  ParserContext,
  SlicerEstimateState,
} from "./parserTypes";
import {
  getPreferredSlicerSeconds,
  updateSlicerEstimate,
} from "./slicerEstimate";
import { detectObjectCancellation } from "./objectCancellation";

class StatisticsSegmentSink implements GcodeSegmentSink {
  private all = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  private printed = [...this.all];
  hasPrinted = false;

  append(startX: number, startY: number, startZ: number, endX: number, endY: number, endZ: number, _layer: number, _commandIndex: number, _isExtruding: boolean, feature: Parameters<GcodeSegmentSink["append"]>[9]): void {
    this.expand(this.all, startX, startY, startZ, endX, endY, endZ);
    if (feature !== "travel") {
      this.hasPrinted = true;
      this.expand(this.printed, startX, startY, startZ, endX, endY, endZ);
    }
  }

  get bounds() {
    const values = this.hasPrinted ? this.printed : this.all;
    const finite = Number.isFinite(values[0]);
    return { hasExtrudingSegments: this.hasPrinted, minX: finite ? values[0] : 0, maxX: finite ? values[1] : 0, minY: finite ? values[2] : 0, maxY: finite ? values[3] : 0, minZ: finite ? values[4] : 0, maxZ: finite ? values[5] : 0 };
  }

  private expand(bounds: number[], startX: number, startY: number, startZ: number, endX: number, endY: number, endZ: number): void {
    bounds[0] = Math.min(bounds[0], startX, endX); bounds[1] = Math.max(bounds[1], startX, endX);
    bounds[2] = Math.min(bounds[2], startY, endY); bounds[3] = Math.max(bounds[3], startY, endY);
    bounds[4] = Math.min(bounds[4], startZ, endZ); bounds[5] = Math.max(bounds[5], startZ, endZ);
  }
}

function createParserContext(
  profile: GcodeAnalysisProfile,
  usesAutomaticLayers: boolean,
  startsBeforeFirstLayerMarker:
    boolean,
): ParserContext {
  return {
    profile,
    machine: {
      position: {
        x: 0,
        y: 0,
        z: 0,
        e: 0,
      },
      absolutePositioning: true,
      absoluteExtrusion: true,
      unitScale: 1,
      speedMultiplier: 1,
      feedRate:
        profile
          .defaultFeedRateMmPerMinute,
      printAcceleration:
        profile
          .printAccelerationMmPerSecondSquared,
      travelAcceleration:
        profile
          .travelAccelerationMmPerSecondSquared,
      activeFeature: "unknown",
      currentLayer:
        startsBeforeFirstLayerMarker
          ? 0
          : 1,
      highestLayer: 1,
      usesAutomaticLayers,
      lastAutomaticLayerZ: null,
    },
    totals: {
      filamentLengthMm: 0,
      travelDistanceMm: 0,
      extrusionDistanceMm: 0,
      retractionCount: 0,
      maximumHotendTemperature:
        null,
      maximumBedTemperature:
        null,
      heatingSeconds: 0,
      featurePathCounts:
        new Uint32Array(
          GCODE_FEATURES.length,
        ),
      featureDistances:
        new Float64Array(
          GCODE_FEATURES.length,
        ),
      featureDurations:
        new Float64Array(
          GCODE_FEATURES.length,
        ),
    },
  };
}

export function parseGcode(
  fileName: string,
  text: string,
  options: ParseGcodeOptions = {},
): ParsedGcode {
  const lines = text.split(/\r?\n/);
  const objectCancellation = detectObjectCancellation(lines);
  const statisticsSink = options.includeGeometry === false ? new StatisticsSegmentSink() : null;
  const segmentBuilder: GcodeSegmentSink = statisticsSink ?? new GcodeSegmentStoreBuilder();
  const timelineBuilder =
    new CumulativeTimeBuilder();
  const profile:
    GcodeAnalysisProfile = {
      ...DEFAULT_GCODE_ANALYSIS_PROFILE,
      ...options.profile,
    };
  const slicerEstimate:
    SlicerEstimateState = {
      total: null,
      elapsedSeconds: null,
      remainingSeconds: null,
    };
  const layerMarkerMode =
    detectLayerMarkerMode(lines);
  const context =
    createParserContext(
      profile,
      layerMarkerMode === "none",
      layerMarkerMode ===
        "layer-change" ||
        layerMarkerMode ===
          "z-comment",
    );
  const commandLayers =
    new Uint32Array(lines.length);

  for (const rawLine of lines) {
    updateSlicerEstimate(
      slicerEstimate,
      rawLine,
    );

    const detectedFeature =
      detectFeatureCategory(rawLine);

    if (detectedFeature) {
      context.machine.activeFeature =
        detectedFeature === "travel"
          ? "unknown"
          : detectedFeature;
    }

    context.machine.currentLayer =
      updateCommentLayer(
        rawLine,
        layerMarkerMode,
        context.machine.currentLayer,
      );
    context.machine.highestLayer =
      Math.max(
        context.machine.highestLayer,
        context.machine.currentLayer,
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

    if (parsed) {
      commandDuration =
        processParsedCommand(
          context,
          parsed,
          commandIndex,
          segmentBuilder,
        );
    }

    commandLayers[
      commandIndex - 1
    ] = Math.max(
      1,
      context.machine.currentLayer,
    );
    timelineBuilder.append(
      commandDuration,
    );
  }

  const segments = segmentBuilder instanceof GcodeSegmentStoreBuilder
    ? segmentBuilder.finish()
    : new GcodeSegmentStore(new Float32Array(), new Uint32Array(), new Uint32Array(), new Uint8Array(), new Uint8Array());
  const bounds =
    statisticsSink?.bounds ?? calculateSegmentBounds(segments);
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
  const {
    totals,
    machine,
  } = context;
  const filamentRadius =
    profile.filamentDiameterMm / 2;
  const filamentVolumeCubicMm =
    Math.PI *
    filamentRadius *
    filamentRadius *
    totals.filamentLengthMm;
  const filamentWeightGrams =
    (
      filamentVolumeCubicMm /
      1_000
    ) *
    profile
      .filamentDensityGramsPerCubicCentimeter;
  const width =
    bounds.hasExtrudingSegments
      ? Math.max(
          0,
          bounds.maxX -
            bounds.minX,
        )
      : null;
  const depth =
    bounds.hasExtrudingSegments
      ? Math.max(
          0,
          bounds.maxY -
            bounds.minY,
        )
      : null;
  const height =
    bounds.hasExtrudingSegments
      ? Math.max(
          0,
          bounds.maxZ -
            bounds.minZ,
        )
      : null;

  return {
    fileName,
    filePath:
      options.filePath ?? null,
    fileSize:
      options.fileSize ?? null,
    fileSha256:
      options.fileSha256 ?? null,
    segments,
    commandLayers:
      commandLayers.slice(
        0,
        timelineBuilder.commandCount,
      ),
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
        totals.heatingSeconds *
        durationScale,
      filamentLengthMm:
        totals.filamentLengthMm,
      filamentWeightGrams,
      widthMm: width,
      depthMm: depth,
      heightMm: height,
      travelDistanceMm:
        totals.travelDistanceMm,
      extrusionDistanceMm:
        totals
          .extrusionDistanceMm,
      retractionCount:
        totals.retractionCount,
      maximumHotendTemperatureCelsius:
        totals
          .maximumHotendTemperature,
      maximumBedTemperatureCelsius:
        totals
          .maximumBedTemperature,
      featureBreakdown:
        createFeatureBreakdown(
          totals.featurePathCounts,
          totals.featureDistances,
          totals.featureDurations,
          durationScale,
        ),
    },
    timing: {
      cumulativeSeconds,
      totalSeconds,
      motionTotalSeconds,
      heatingSeconds:
        totals.heatingSeconds *
        durationScale,
      source,
      confidence,
    },
    cancelableObjects: objectCancellation.objects,
    objectCancellationProtocol: objectCancellation.protocol,
    totalLines: lines.length,
    totalLayers: Math.max(
      1,
      machine.highestLayer,
    ),
    printableLines:
      cumulativeSeconds.length - 1,
    minX: bounds.minX,
    maxX: bounds.maxX,
    minY: bounds.minY,
    maxY: bounds.maxY,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  };
}
