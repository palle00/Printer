import type {
  GcodeStatistics,
} from "../types/gcode";
import {
  formatDuration,
} from "../utils/time";

function formatDistance(
  millimeters: number | null,
): string {
  if (
    millimeters === null ||
    !Number.isFinite(millimeters)
  ) {
    return "-";
  }

  return millimeters >= 1_000
    ? `${(millimeters / 1_000).toFixed(2)} m`
    : `${millimeters.toFixed(1)} mm`;
}

function formatTemperature(
  value: number | null,
): string {
  return value === null
    ? "-"
    : `${value.toFixed(0)} C`;
}

function Statistic({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-gray-500">
        {label}
      </div>
      <div className="mt-0.5 text-gray-200">
        {value}
      </div>
    </div>
  );
}

export default function PreviewStatistics({
  statistics,
  layerCount,
}: {
  statistics: GcodeStatistics;
  layerCount: number;
}) {
  const dimensions =
    statistics.widthMm !== null &&
    statistics.depthMm !== null &&
    statistics.heightMm !== null
      ? `${statistics.widthMm.toFixed(1)} x ${statistics.depthMm.toFixed(1)} x ${statistics.heightMm.toFixed(1)} mm`
      : "-";

  return (
    <details className="group relative z-20">
      <summary className="cursor-pointer list-none select-none rounded border border-[#263548] bg-[#131f2c] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300">
        Statistics
      </summary>

      <div className="absolute left-0 top-full mt-2 grid w-80 grid-cols-2 gap-x-4 gap-y-2 border border-[#263548] bg-[#101a26]/98 p-3 text-[9px] font-mono shadow-2xl">
        <Statistic
          label="Estimated duration"
          value={
            statistics.estimatedDurationSeconds ===
            null
              ? "-"
              : formatDuration(
                  statistics.estimatedDurationSeconds,
                )
          }
        />
        <Statistic
          label="Estimate"
          value={`${statistics.estimateSource} / ${statistics.estimateConfidence}`}
        />
        <Statistic
          label="Filament"
          value={formatDistance(
            statistics.filamentLengthMm,
          )}
        />
        <Statistic
          label="Weight"
          value={`${statistics.filamentWeightGrams.toFixed(1)} g`}
        />
        <Statistic
          label="Model W x D x H"
          value={dimensions}
        />
        <Statistic
          label="Layers"
          value={layerCount.toLocaleString()}
        />
        <Statistic
          label="Travel distance"
          value={formatDistance(
            statistics.travelDistanceMm,
          )}
        />
        <Statistic
          label="Extrusion movement"
          value={formatDistance(
            statistics.extrusionDistanceMm,
          )}
        />
        <Statistic
          label="Retractions"
          value={statistics.retractionCount.toLocaleString()}
        />
        <Statistic
          label="Heating estimate"
          value={formatDuration(
            statistics.heatingEstimateSeconds,
          )}
        />
        <Statistic
          label="Maximum hotend"
          value={formatTemperature(
            statistics.maximumHotendTemperatureCelsius,
          )}
        />
        <Statistic
          label="Maximum bed"
          value={formatTemperature(
            statistics.maximumBedTemperatureCelsius,
          )}
        />
      </div>
    </details>
  );
}
