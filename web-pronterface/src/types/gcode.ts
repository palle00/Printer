import type {
  GcodeFeatureCategory,
} from "../gcode/features";
import type {
  GcodeSegmentStore,
} from "../gcode/GcodeSegmentStore";

export type EstimateSource =
  | "slicer"
  | "motion"
  | "live";

export type EstimateConfidence =
  | "low"
  | "medium"
  | "high";

export interface GcodeFeatureStatistics {
  category: GcodeFeatureCategory;
  pathCount: number;
  movementDistanceMm: number;
  estimatedDurationSeconds: number;
  movementPercentage: number;
}

export interface GcodeStatistics {
  estimatedDurationSeconds: number | null;
  estimateSource: Exclude<
    EstimateSource,
    "live"
  >;
  estimateConfidence: EstimateConfidence;
  slicerEstimateSeconds: number | null;
  motionEstimateSeconds: number | null;
  heatingEstimateSeconds: number;
  filamentLengthMm: number;
  filamentWeightGrams: number;
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
  travelDistanceMm: number;
  extrusionDistanceMm: number;
  retractionCount: number;
  maximumHotendTemperatureCelsius: number | null;
  maximumBedTemperatureCelsius: number | null;
  featureBreakdown: GcodeFeatureStatistics[];
}

export interface GcodeTimingModel {
  cumulativeSeconds:
    Float32Array<ArrayBufferLike>;
  totalSeconds: number;
  motionTotalSeconds: number;
  heatingSeconds: number;
  source: Exclude<
    EstimateSource,
    "live"
  >;
  confidence: EstimateConfidence;
}

export interface ParsedGcode {
  fileName: string;
  filePath: string | null;
  fileSize: number | null;
  fileSha256: string | null;
  segments: GcodeSegmentStore;
  commandLayers:
    Uint32Array<ArrayBufferLike>;
  statistics: GcodeStatistics;
  timing: GcodeTimingModel;

  totalLines: number;
  totalLayers: number;
  printableLines: number;

  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}
