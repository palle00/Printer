import {
  createPrintProgress,
} from "../../print/printMath";
import {
  updateLiveEta,
} from "../../print/liveEta";
import type {
  PrintCompletionMetrics,
  PrintProgress,
} from "../../types/printer";
import type {
  ProgressOptions,
} from "./runnerContext";
import type {
  PrintSession,
} from "./sessionTypes";
import {
  getElapsedMilliseconds,
} from "./sessionUtils";

interface CompletionResult {
  elapsedSeconds: number;
  metrics: PrintCompletionMetrics;
}

function getRealTimingOverrides(
  session: Extract<
    PrintSession,
    { mode: "real" }
  >,
  elapsedSeconds: number,
): {
  percentOverride: number;
  etaSecondsOverride: number;
  estimatedTotalSeconds: number;
  estimateSource:
    "slicer" | "motion" | "live";
  estimateConfidence:
    "low" | "medium" | "high";
  isHeating: boolean;
} {
  const timing = session.timing;
  const predictedElapsed =
    timing.cumulativeSeconds[
      Math.min(
        session.currentLine,
        timing.cumulativeSeconds.length - 1,
      )
    ];
  const totalSeconds =
    Math.max(0, timing.totalSeconds);
  const heatingSeconds =
    Math.min(
      totalSeconds,
      Math.max(0, timing.heatingSeconds),
    );
  const isHeating =
    heatingSeconds > 0 &&
    predictedElapsed < heatingSeconds;

  if (
    !isHeating &&
    session.heatingCompletedAtActiveSeconds === null
  ) {
    session.heatingCompletedAtActiveSeconds =
      elapsedSeconds;
  }

  if (isHeating) {
    return {
      percentOverride:
        totalSeconds > 0
          ? (
              predictedElapsed /
              totalSeconds
            ) * 100
          : 0,
      etaSecondsOverride:
        Math.max(
          0,
          totalSeconds -
            heatingSeconds +
            Math.max(
              0,
              heatingSeconds -
                elapsedSeconds,
            ),
        ),
      estimatedTotalSeconds:
        totalSeconds,
      estimateSource:
        timing.source,
      estimateConfidence: "low",
      isHeating: true,
    };
  }

  const actualHeatingSeconds =
    session.heatingCompletedAtActiveSeconds ?? 0;
  const live = updateLiveEta({
    state: session.calibration,
    actualPrintSeconds:
      Math.max(
        0,
        elapsedSeconds -
          actualHeatingSeconds,
      ),
    predictedPrintElapsedSeconds:
      Math.max(
        0,
        predictedElapsed -
          heatingSeconds,
      ),
    predictedPrintTotalSeconds:
      Math.max(
        0,
        totalSeconds -
          heatingSeconds,
      ),
    baseSource: timing.source,
    baseConfidence:
      session.currentLine === 0
        ? "low"
        : timing.confidence,
  });

  session.calibration = live.state;
  session.lastCalibratedTotalSeconds =
    actualHeatingSeconds +
    live.calibratedTotalPrintSeconds;

  return {
    percentOverride:
      totalSeconds > 0
        ? (
            predictedElapsed /
            totalSeconds
          ) * 100
        : 100,
    etaSecondsOverride:
      live.remainingSeconds,
    estimatedTotalSeconds:
      session.lastCalibratedTotalSeconds,
    estimateSource: live.source,
    estimateConfidence:
      live.confidence,
    isHeating: false,
  };
}

export function createSessionProgress(
  session: PrintSession,
  options?: ProgressOptions,
): PrintProgress {
  const elapsedSeconds =
    getElapsedMilliseconds(session) / 1000;
  const realTiming =
    session.mode === "real"
      ? getRealTimingOverrides(
          session,
          elapsedSeconds,
        )
      : undefined;

  return createPrintProgress({
    fileName: session.fileName,
    currentLine: session.currentLine,
    totalLines: session.totalLines,
    currentLayer: session.currentLayer,
    totalLayers: session.totalLayers,
    elapsedSeconds,
    percentOverride:
      options?.percentOverride,
    estimatedDurationSeconds:
      options?.estimatedDurationSeconds,
    ...realTiming,
  });
}

export function createCompletionResult(
  session: PrintSession,
): CompletionResult {
  const elapsedSeconds =
    session.elapsedBeforeRunMs / 1000;
  const originalEstimate =
    session.mode === "real"
      ? session.timing.totalSeconds
      : session.durationMs / 1000;
  const finalEstimate =
    session.mode === "real"
      ? session.lastCalibratedTotalSeconds
      : originalEstimate;
  const absoluteError =
    Math.abs(
      originalEstimate -
        elapsedSeconds,
    );

  return {
    elapsedSeconds,
    metrics: {
      originalEstimateSeconds:
        originalEstimate,
      finalCalibratedEstimateSeconds:
        finalEstimate,
      actualActiveSeconds:
        elapsedSeconds,
      absoluteErrorSeconds:
        absoluteError,
      percentageError:
        elapsedSeconds > 0
          ? (
              absoluteError /
              elapsedSeconds
            ) * 100
          : null,
      estimateSource:
        session.mode === "real"
          ? session.calibration.sampleCount > 0
            ? "live"
            : session.timing.source
          : null,
    },
  };
}
