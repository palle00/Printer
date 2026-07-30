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
    <details className="absolute left-3 top-3 z-10 w-80 max-w-[calc(100%-1.5rem)] border border-gray-700 bg-[#121620]/95 shadow-xl">
      <summary className="cursor-pointer select-none px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-300">
        Preview statistics
      </summary>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-800 p-3 text-[9px] font-mono">
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
