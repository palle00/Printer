import type { TemperatureSample } from "../types/printer";

interface TemperatureGraphProps {
  samples: TemperatureSample[];
}

const WIDTH = 600;
const HEIGHT = 190;

const PADDING = {
  top: 16,
  right: 18,
  bottom: 28,
  left: 44,
};

export default function TemperatureGraph({
  samples,
}: TemperatureGraphProps) {
  const graphWidth =
    WIDTH - PADDING.left - PADDING.right;

  const graphHeight =
    HEIGHT - PADDING.top - PADDING.bottom;

  const maximumTemperature = Math.max(
    100,
    ...samples.flatMap((sample) => [
      sample.hotend,
      sample.targetHotend,
      sample.bed,
      sample.targetBed,
    ]),
  );

  const yMaximum =
    Math.ceil(maximumTemperature / 50) * 50;

  const getX = (index: number) => {
    if (samples.length <= 1) {
      return PADDING.left + graphWidth / 2;
    }

    return (
      PADDING.left +
      (index / (samples.length - 1)) * graphWidth
    );
  };

  const getY = (temperature: number) => {
    return (
      PADDING.top +
      graphHeight -
      (temperature / yMaximum) * graphHeight
    );
  };

  const createPoints = (
    getTemperature: (
      sample: TemperatureSample,
    ) => number,
  ) => {
    return samples
      .map(
        (sample, index) =>
          `${getX(index)},${getY(
            getTemperature(sample),
          )}`,
      )
      .join(" ");
  };

  const hotendPoints = createPoints(
    (sample) => sample.hotend,
  );

  const bedPoints = createPoints(
    (sample) => sample.bed,
  );

  const horizontalGridLines = 5;

  const latestSample =
    samples[samples.length - 1] ?? null;

  return (
    <div className="bg-[#181d2c] p-3 rounded border border-gray-800">
      <div className="flex justify-between items-center mb-2 text-[10px] font-mono text-gray-400">
        <div className="flex gap-3">
          <span className="text-red-400">
            — HOTEND
          </span>

          <span className="text-blue-400">
            — BED
          </span>
        </div>

        <span>
          {samples.length} SAMPLES
        </span>
      </div>

      <div className="relative bg-black rounded border border-gray-900 overflow-hidden">
        {samples.length === 0 ? (
          <div className="h-[clamp(6rem,18vh,11rem)] flex items-center justify-center text-[10px] text-gray-600 font-mono">
            Waiting for temperature data...
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="block w-full h-[clamp(6rem,18vh,11rem)]"
            preserveAspectRatio="none"
          >
            <rect
              x="0"
              y="0"
              width={WIDTH}
              height={HEIGHT}
              fill="#000000"
            />

            {Array.from({
              length: horizontalGridLines + 1,
            }).map((_, index) => {
              const ratio =
                index / horizontalGridLines;

              const y =
                PADDING.top +
                graphHeight * ratio;

              const temperature = Math.round(
                yMaximum * (1 - ratio),
              );

              return (
                <g key={index}>
                  <line
                    x1={PADDING.left}
                    x2={WIDTH - PADDING.right}
                    y1={y}
                    y2={y}
                    stroke="#1f2937"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />

                  <text
                    x={PADDING.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="#6b7280"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    {temperature}°
                  </text>
                </g>
              );
            })}

            <line
              x1={PADDING.left}
              x2={PADDING.left}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="#374151"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={HEIGHT - PADDING.bottom}
              y2={HEIGHT - PADDING.bottom}
              stroke="#374151"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {samples.length > 1 && (
              <>
                <polyline
                  points={hotendPoints}
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />

                <polyline
                  points={bedPoints}
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}

            {samples.map((sample, index) => {
              const x = getX(index);

              return (
                <g key={sample.timestamp}>
                  <circle
                    cx={x}
                    cy={getY(sample.hotend)}
                    r="2.5"
                    fill="#f87171"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>
                      Hotend:{" "}
                      {sample.hotend.toFixed(1)} °C
                    </title>
                  </circle>

                  <circle
                    cx={x}
                    cy={getY(sample.bed)}
                    r="2.5"
                    fill="#60a5fa"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>
                      Bed:{" "}
                      {sample.bed.toFixed(1)} °C
                    </title>
                  </circle>
                </g>
              );
            })}

            {latestSample && (
              <>
                <text
                  x={WIDTH - PADDING.right}
                  y={getY(latestSample.hotend) - 7}
                  textAnchor="end"
                  fill="#f87171"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {latestSample.hotend.toFixed(1)}°
                </text>

                <text
                  x={WIDTH - PADDING.right}
                  y={getY(latestSample.bed) + 15}
                  textAnchor="end"
                  fill="#60a5fa"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {latestSample.bed.toFixed(1)}°
                </text>
              </>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
