import type {
  GcodeFeatureCategory,
} from "../features";
import type {
  GcodeAnalysisProfile,
  SlicerTimeMetadata,
} from "../timeEstimation";

export interface Position {
  x: number;
  y: number;
  z: number;
  e: number;
}

export interface CommandParameters {
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

export interface ParsedCommand {
  command: string;
  parameters: CommandParameters;
}

export interface ParseGcodeOptions {
  filePath?: string | null;
  fileSize?: number | null;
  fileSha256?: string | null;
  profile?: Partial<GcodeAnalysisProfile>;
}

export interface SlicerEstimateState {
  total: SlicerTimeMetadata | null;
  elapsedSeconds: number | null;
  remainingSeconds: number | null;
}

export interface ParserMachineState {
  position: Position;
  absolutePositioning: boolean;
  absoluteExtrusion: boolean;
  unitScale: number;
  speedMultiplier: number;
  feedRate: number;
  printAcceleration: number;
  travelAcceleration: number;
  activeFeature: GcodeFeatureCategory;
  currentLayer: number;
  highestLayer: number;
  usesAutomaticLayers: boolean;
  lastAutomaticLayerZ: number | null;
}

export interface ParserAnalysisTotals {
  filamentLengthMm: number;
  travelDistanceMm: number;
  extrusionDistanceMm: number;
  retractionCount: number;
  maximumHotendTemperature: number | null;
  maximumBedTemperature: number | null;
  heatingSeconds: number;
  featurePathCounts:
    Uint32Array<ArrayBufferLike>;
  featureDistances:
    Float64Array<ArrayBufferLike>;
  featureDurations:
    Float64Array<ArrayBufferLike>;
}

export interface ParserContext {
  profile: GcodeAnalysisProfile;
  machine: ParserMachineState;
  totals: ParserAnalysisTotals;
}
