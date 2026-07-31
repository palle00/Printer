import {
  GCODE_FEATURES,
  type GcodeFeatureCategory,
} from "../gcode/features";
import type {
  GcodeFeatureStatistics,
} from "../types/gcode";

interface PreviewLegendProps {
  statistics:
    GcodeFeatureStatistics[];
  visibility:
    Readonly<
      Record<
        GcodeFeatureCategory,
        boolean
      >
    >;
  onChange(
    visibility:
      Record<
        GcodeFeatureCategory,
        boolean
      >,
  ): void;
}

function setEveryCategory(
  value: boolean,
): Record<
  GcodeFeatureCategory,
  boolean
> {
  return Object.fromEntries(
    GCODE_FEATURES.map(
      (feature) => [
        feature.id,
        value,
      ],
    ),
  ) as Record<
    GcodeFeatureCategory,
    boolean
  >;
}

export default function PreviewLegend({
  statistics,
  visibility,
  onChange,
}: PreviewLegendProps) {
  const statisticsByCategory =
    new Map(
      statistics.map(
        (entry) => [
          entry.category,
          entry,
        ],
      ),
    );

  return (
    <details className="group relative z-20">
      <summary className="cursor-pointer list-none select-none rounded border border-[#263548] bg-[#131f2c] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300">
        Path categories
      </summary>

      <div className="absolute bottom-full left-0 mb-2 w-72 border border-[#263548] bg-[#101a26]/98 p-3 shadow-2xl">
        <div className="mb-3 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => {
              onChange(
                setEveryCategory(
                  true,
                ),
              );
            }}
            className="border border-gray-700 bg-[#181d2c] px-2 py-1 text-[9px] text-gray-300 hover:bg-gray-800"
          >
            Show all
          </button>

          <button
            type="button"
            onClick={() => {
              onChange(
                setEveryCategory(
                  false,
                ),
              );
            }}
            className="border border-gray-700 bg-[#181d2c] px-2 py-1 text-[9px] text-gray-300 hover:bg-gray-800"
          >
            Hide all
          </button>

          <button
            type="button"
            onClick={() => {
              onChange(
                Object.fromEntries(
                  GCODE_FEATURES.map(
                    (feature) => [
                      feature.id,
                      feature.extrusion,
                    ],
                  ),
                ) as Record<
                  GcodeFeatureCategory,
                  boolean
                >,
              );
            }}
            className="border border-gray-700 bg-[#181d2c] px-2 py-1 text-[9px] text-gray-300 hover:bg-gray-800"
          >
            Extrusion only
          </button>

          <button
            type="button"
            onClick={() => {
              onChange(
                Object.fromEntries(
                  GCODE_FEATURES.map(
                    (feature) => [
                      feature.id,
                      feature.defaultVisible,
                    ],
                  ),
                ) as Record<
                  GcodeFeatureCategory,
                  boolean
                >,
              );
            }}
            className="border border-gray-700 bg-[#181d2c] px-2 py-1 text-[9px] text-gray-300 hover:bg-gray-800"
          >
            Defaults
          </button>
        </div>

        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {GCODE_FEATURES.map(
            (feature) => {
              const entry =
                statisticsByCategory.get(
                  feature.id,
                );

              return (
                <label
                  key={feature.id}
                  className="grid cursor-pointer grid-cols-[auto_auto_1fr_auto] items-center gap-2 py-0.5 text-[9px] font-mono text-gray-400"
                >
                  <input
                    type="checkbox"
                    checked={
                      visibility[
                        feature.id
                      ]
                    }
                    onChange={(
                      event,
                    ) => {
                      onChange({
                        ...visibility,
                        [feature.id]:
                          event.target
                            .checked,
                      });
                    }}
                    className="accent-blue-500"
                  />

                  <span
                    className="h-2.5 w-2.5"
                    style={{
                      backgroundColor:
                        feature.color,
                    }}
                  />

                  <span className="truncate">
                    {feature.name}
                  </span>

                  <span className="text-right text-gray-500">
                    {(
                      entry?.pathCount ??
                      0
                    ).toLocaleString()}
                    {entry &&
                      entry.movementPercentage >
                        0 &&
                      ` / ${entry.movementPercentage.toFixed(1)}%`}
                  </span>
                </label>
              );
            },
          )}
        </div>

        <div className="mt-2 border-t border-gray-800 pt-2 text-[9px] text-gray-600">
          Percentages are movement
          distance.
        </div>
      </div>
    </details>
  );
}
