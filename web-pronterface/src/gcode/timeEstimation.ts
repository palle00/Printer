import type {
  EstimateConfidence,
} from "../types/gcode";

export interface GcodeAnalysisProfile {
  filamentDiameterMm: number;
  filamentDensityGramsPerCubicCentimeter: number;
  printAccelerationMmPerSecondSquared: number;
  travelAccelerationMmPerSecondSquared: number;
  defaultFeedRateMmPerMinute: number;
  nozzleHeatingWaitSeconds: number;
  bedHeatingWaitSeconds: number;
  pauseSeconds: number;
  filamentChangeSeconds: number;
}

export const DEFAULT_GCODE_ANALYSIS_PROFILE:
  GcodeAnalysisProfile = {
    filamentDiameterMm: 1.75,
    filamentDensityGramsPerCubicCentimeter: 1.24,
    printAccelerationMmPerSecondSquared: 1_000,
    travelAccelerationMmPerSecondSquared: 1_500,
    defaultFeedRateMmPerMinute: 1_800,
    nozzleHeatingWaitSeconds: 90,
    bedHeatingWaitSeconds: 120,
    pauseSeconds: 30,
    filamentChangeSeconds: 120,
  };

const MAXIMUM_ESTIMATE_SECONDS =
  60 * 60 * 24 * 30;

export interface SlicerTimeMetadata {
  kind:
    | "total"
    | "elapsed"
    | "remaining";
  seconds: number;
  priority: number;
}

function validateDuration(
  seconds: number,
): number | null {
  return (
    Number.isFinite(seconds) &&
    seconds > 0 &&
    seconds <= MAXIMUM_ESTIMATE_SECONDS
  )
    ? seconds
    : null;
}

export function parseDurationValue(
  value: string,
): number | null {
  const normalized =
    value.trim().toLowerCase();
  const clock = normalized.match(
    /\b(\d{1,3}):(\d{1,2}):(\d{1,2})\b/,
  );

  if (clock) {
    return validateDuration(
      Number(clock[1]) * 3600 +
      Number(clock[2]) * 60 +
      Number(clock[3]),
    );
  }

  let seconds = 0;
  let matched = false;
  const units =
    /(\d+(?:\.\d+)?)\s*(d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:utes?)?)?|s(?:ec(?:onds?)?)?)/gi;
  let unitMatch: RegExpExecArray | null;

  while (
    (unitMatch = units.exec(normalized)) !==
    null
  ) {
    matched = true;
    const amount = Number(unitMatch[1]);
    const unit =
      unitMatch[2].toLowerCase();

    if (unit.startsWith("d")) {
      seconds += amount * 86_400;
    } else if (unit.startsWith("h")) {
      seconds += amount * 3_600;
    } else if (unit.startsWith("m")) {
      seconds += amount * 60;
    } else {
      seconds += amount;
    }
  }

  if (matched) {
    return validateDuration(seconds);
  }

  const plainSeconds = normalized.match(
    /^\s*(\d+(?:\.\d+)?)\s*$/,
  );

  return plainSeconds
    ? validateDuration(
        Number(plainSeconds[1]),
      )
    : null;
}

export function extractSlicerTimeMetadata(
  rawLine: string,
): SlicerTimeMetadata | null {
  if (!rawLine.trimStart().startsWith(";")) {
    return null;
  }

  const line = rawLine
    .replace(/^\s*;\s*/, "")
    .trim();
  const lower = line.toLowerCase();

  if (
    lower.includes("first layer") ||
    lower.includes("until color change")
  ) {
    return null;
  }

  let kind:
    SlicerTimeMetadata["kind"] =
      "total";
  let priority = 1;

  if (
    lower.includes("remaining") ||
    /^time_remaining\b/i.test(line)
  ) {
    kind = "remaining";
    priority = 0;
  } else if (
    lower.includes("elapsed") ||
    /^time_elapsed\b/i.test(line)
  ) {
    kind = "elapsed";
    priority = 0;
  } else if (
    lower.includes("normal mode") ||
    lower.includes("total estimated") ||
    lower.includes("model printing time")
  ) {
    priority = 4;
  } else if (
    lower.includes("estimated printing time") ||
    lower.includes("print time") ||
    lower.includes("printing time") ||
    /^total\s+time\s*[:=]/i.test(
      line,
    )
  ) {
    priority = 3;
  } else if (
    /^time\s*[:=]/i.test(line)
  ) {
    priority = 2;
  } else {
    return null;
  }

  const equalsIndex =
    line.indexOf("=");
  const separatorIndex =
    equalsIndex >= 0
      ? equalsIndex
      : line.indexOf(":");
  const value =
    separatorIndex >= 0
      ? line.slice(separatorIndex + 1)
      : line;
  const seconds =
    parseDurationValue(value);

  return seconds === null
    ? null
    : {
        kind,
        seconds,
        priority,
      };
}

export function estimateMotionSeconds(
  distanceMm: number,
  feedRateMmPerMinute: number,
  accelerationMmPerSecondSquared: number,
): number {
  if (
    !Number.isFinite(distanceMm) ||
    distanceMm <= 0
  ) {
    return 0;
  }

  const speed = Math.max(
    0.1,
    feedRateMmPerMinute / 60,
  );
  const acceleration = Math.max(
    1,
    accelerationMmPerSecondSquared,
  );
  const accelerationDistance =
    (speed * speed) / acceleration;

  if (distanceMm >= accelerationDistance) {
    return (
      (2 * speed) / acceleration +
      (
        distanceMm -
        accelerationDistance
      ) /
        speed
    );
  }

  return (
    2 *
    Math.sqrt(
      distanceMm / acceleration,
    )
  );
}

export class CumulativeTimeBuilder {
  private values =
    new Float64Array(16_384);
  private count = 1;
  private total = 0;

  constructor() {
    this.values[0] = 0;
  }

  append(durationSeconds: number): void {
    this.ensureCapacity(this.count + 1);
    this.total +=
      Number.isFinite(durationSeconds)
        ? Math.max(0, durationSeconds)
        : 0;
    this.values[this.count] =
      this.total;
    this.count++;
  }

  get totalSeconds(): number {
    return this.total;
  }

  get commandCount(): number {
    return this.count - 1;
  }

  finish(
    targetTotalSeconds?: number,
  ): Float32Array<ArrayBufferLike> {
    const scale =
      targetTotalSeconds !== undefined &&
      this.total > 0
        ? targetTotalSeconds /
          this.total
        : 1;
    const result =
      new Float32Array(this.count);

    for (
      let index = 0;
      index < this.count;
      index++
    ) {
      result[index] =
        this.values[index] * scale;
    }

    return result;
  }

  private ensureCapacity(
    required: number,
  ): void {
    if (required <= this.values.length) {
      return;
    }

    const next =
      new Float64Array(
        Math.max(
          required,
          this.values.length * 2,
        ),
      );
    next.set(this.values);
    this.values = next;
  }
}

export function getEstimateConfidence(
  source: "slicer" | "motion",
  totalSeconds: number,
): EstimateConfidence {
  if (source === "slicer") {
    return totalSeconds >= 60
      ? "high"
      : "medium";
  }

  return totalSeconds >= 60
    ? "medium"
    : "low";
}
