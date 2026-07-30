import type {
  EstimateConfidence,
  EstimateSource,
} from "../types/gcode";

export const LIVE_ETA_DEFAULTS = {
  minimumActiveSeconds: 180,
  minimumPredictedProgress: 0.03,
  smoothingFactor: 0.08,
  minimumCalibrationFactor: 0.5,
  maximumCalibrationFactor: 3,
  highConfidenceActiveSeconds: 1_200,
  highConfidenceProgress: 0.3,
} as const;

export interface LiveCalibrationState {
  factor: number;
  sampleCount: number;
}

export interface LiveEtaInput {
  state: LiveCalibrationState;
  actualPrintSeconds: number;
  predictedPrintElapsedSeconds:
    number;
  predictedPrintTotalSeconds:
    number;
  baseSource:
    Exclude<EstimateSource, "live">;
  baseConfidence:
    EstimateConfidence;
}

export interface LiveEtaResult {
  state: LiveCalibrationState;
  remainingSeconds: number;
  source: EstimateSource;
  confidence: EstimateConfidence;
  calibratedTotalPrintSeconds:
    number;
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    maximum,
    Math.max(minimum, value),
  );
}

export function createLiveCalibrationState():
  LiveCalibrationState {
  return {
    factor: 1,
    sampleCount: 0,
  };
}

export function updateLiveEta({
  state,
  actualPrintSeconds,
  predictedPrintElapsedSeconds,
  predictedPrintTotalSeconds,
  baseSource,
  baseConfidence,
}: LiveEtaInput): LiveEtaResult {
  const safeTotal = Math.max(
    0,
    predictedPrintTotalSeconds,
  );
  const safePredictedElapsed =
    clamp(
      predictedPrintElapsedSeconds,
      0,
      safeTotal,
    );
  const progress =
    safeTotal > 0
      ? safePredictedElapsed /
        safeTotal
      : 0;
  const canCalibrate =
    actualPrintSeconds >=
      LIVE_ETA_DEFAULTS
        .minimumActiveSeconds &&
    progress >=
      LIVE_ETA_DEFAULTS
        .minimumPredictedProgress &&
    safePredictedElapsed > 0;
  let nextState = state;

  if (canCalibrate) {
    const observedFactor =
      clamp(
        actualPrintSeconds /
          safePredictedElapsed,
        LIVE_ETA_DEFAULTS
          .minimumCalibrationFactor,
        LIVE_ETA_DEFAULTS
          .maximumCalibrationFactor,
      );
    const nextFactor =
      state.sampleCount === 0
        ? 1 +
          (
            observedFactor -
            1
          ) *
            LIVE_ETA_DEFAULTS
              .smoothingFactor
        : state.factor +
          (
            observedFactor -
            state.factor
          ) *
            LIVE_ETA_DEFAULTS
              .smoothingFactor;

    nextState = {
      factor: clamp(
        nextFactor,
        LIVE_ETA_DEFAULTS
          .minimumCalibrationFactor,
        LIVE_ETA_DEFAULTS
          .maximumCalibrationFactor,
      ),
      sampleCount:
        state.sampleCount + 1,
    };
  }

  const isLive =
    nextState.sampleCount > 0;
  const confidence:
    EstimateConfidence =
      !isLive
        ? baseConfidence
        : (
              actualPrintSeconds >=
                LIVE_ETA_DEFAULTS
                  .highConfidenceActiveSeconds &&
              progress >=
                LIVE_ETA_DEFAULTS
                  .highConfidenceProgress
            )
          ? "high"
          : "medium";

  return {
    state: nextState,
    remainingSeconds:
      Math.max(
        0,
        (
          safeTotal -
          safePredictedElapsed
        ) * nextState.factor,
      ),
    source:
      isLive
        ? "live"
        : baseSource,
    confidence,
    calibratedTotalPrintSeconds:
      safeTotal *
      nextState.factor,
  };
}
