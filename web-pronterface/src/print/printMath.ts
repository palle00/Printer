import type {
  TestPrintPath,
} from "../types/printer-ipc";

import type {
  PrintProgress,
  PrinterPosition,
} from "../types/printer";
import type {
  EstimateConfidence,
  EstimateSource,
} from "../types/gcode";

const MIN_TEST_DURATION_SECONDS = 20;
const MAX_TEST_DURATION_SECONDS = 120;
const SEGMENTS_PER_SECOND = 250;

interface CreateProgressOptions {
  fileName: string;

  currentLine: number;
  totalLines: number;

  currentLayer: number;
  totalLayers: number;

  elapsedSeconds: number;

  estimatedDurationSeconds?: number;
  percentOverride?: number;
  etaSecondsOverride?: number;
  estimatedTotalSeconds?:
    number | null;
  estimateSource?:
    EstimateSource | null;
  estimateConfidence?:
    EstimateConfidence | null;
  isHeating?: boolean;
}

export interface TestFrame {
  finished: boolean;
  ratio: number;

  currentLine: number;
  currentLayer: number;

  position: PrinterPosition;
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

export function estimateTestDurationSeconds(
  segmentCount: number,
): number {
  const estimated =
    segmentCount /
    SEGMENTS_PER_SECOND;

  return clamp(
    estimated,
    MIN_TEST_DURATION_SECONDS,
    MAX_TEST_DURATION_SECONDS,
  );
}

export function createPrintProgress({
  fileName,
  currentLine,
  totalLines,
  currentLayer,
  totalLayers,
  elapsedSeconds,
  estimatedDurationSeconds,
  percentOverride,
  etaSecondsOverride,
  estimatedTotalSeconds,
  estimateSource = null,
  estimateConfidence = null,
  isHeating = false,
}: CreateProgressOptions): PrintProgress {
  const safeTotalLines = Math.max(
    0,
    totalLines,
  );

  const safeCurrentLine = clamp(
    currentLine,
    0,
    safeTotalLines,
  );

  const calculatedPercent =
    safeTotalLines === 0
      ? 100
      : (
          safeCurrentLine /
          safeTotalLines
        ) * 100;

  const percent = clamp(
    percentOverride ??
      calculatedPercent,
    0,
    100,
  );

  let etaSeconds =
    etaSecondsOverride ?? 0;

  if (
    estimatedDurationSeconds !==
    undefined
  ) {
    etaSeconds = Math.max(
      0,
      estimatedDurationSeconds -
        elapsedSeconds,
    );
  }

  return {
    fileName,

    currentLine: safeCurrentLine,
    totalLines: safeTotalLines,

    currentLayer: clamp(
      currentLayer,
      totalLayers > 0 ? 1 : 0,
      Math.max(0, totalLayers),
    ),

    totalLayers: Math.max(
      0,
      totalLayers,
    ),

    percent,
    elapsedSeconds: Math.max(
      0,
      elapsedSeconds,
    ),

    etaSeconds: Math.max(
      0,
      etaSeconds,
    ),
    estimatedTotalSeconds:
      estimatedTotalSeconds ??
      estimatedDurationSeconds ??
      null,
    estimateSource,
    estimateConfidence,
    isHeating,
  };
}

export function calculateTestFrame(
  path: TestPrintPath,
  printableLines: number,
  totalLayers: number,
  elapsedMilliseconds: number,
  durationMilliseconds: number,
): TestFrame {
  const safeDuration =
    Math.max(
      1,
      durationMilliseconds,
    );

  const ratio = clamp(
    elapsedMilliseconds /
      safeDuration,
    0,
    1,
  );

  const segmentCount =
    path.commandIndexes.length;

  if (segmentCount === 0) {
    return {
      finished: true,
      ratio: 1,

      currentLine:
        printableLines,

      currentLayer:
        totalLayers,

      position: {
        x: 0,
        y: 0,
        z: 0,
        e: 0,
      },
    };
  }

  const segmentProgress =
    ratio * segmentCount;

  const segmentIndex = Math.min(
    segmentCount - 1,
    Math.floor(segmentProgress),
  );

  const coordinateOffset =
    segmentIndex * 6;

  const localRatio =
    ratio >= 1
      ? 1
      : segmentProgress -
        segmentIndex;

  const position: PrinterPosition = {
    x:
      path.coordinates[
        coordinateOffset
      ] +
      (
        path.coordinates[
          coordinateOffset + 3
        ] -
        path.coordinates[
          coordinateOffset
        ]
      ) *
        localRatio,

    y:
      path.coordinates[
        coordinateOffset + 1
      ] +
      (
        path.coordinates[
          coordinateOffset + 4
        ] -
        path.coordinates[
          coordinateOffset + 1
        ]
      ) *
        localRatio,

    z:
      path.coordinates[
        coordinateOffset + 2
      ] +
      (
        path.coordinates[
          coordinateOffset + 5
        ] -
        path.coordinates[
          coordinateOffset + 2
        ]
      ) *
        localRatio,

    e:
      path.extruding[
        segmentIndex
      ] !== 0
      ? localRatio
      : 0,
  };

  return {
    finished: ratio >= 1,
    ratio,

    currentLine:
      ratio >= 1
        ? printableLines
        : Math.max(
            0,
            path.commandIndexes[
              segmentIndex
            ] - 1,
          ),

    currentLayer:
      ratio >= 1
        ? totalLayers
        : path.layers[
            segmentIndex
          ],

    position,
  };
}
