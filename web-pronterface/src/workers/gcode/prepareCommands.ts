export interface PreparedCommand {
  text: string;
  layer: number;
}

type LayerMarkerMode =
  | "numbered"
  | "change"
  | "z"
  | "none";

export function stripGcodeLine(
  rawLine: string,
): string {
  const withoutComment =
    rawLine.split(";")[0];

  const withoutChecksum =
    withoutComment.split("*")[0];

  return withoutChecksum
    .replace(
      /^\s*N\d+\s+/i,
      "",
    )
    .trim();
}

function detectLayerMarkerMode(
  lines: string[],
): LayerMarkerMode {
  if (
    lines.some((line) =>
      /^\s*;\s*LAYER:\s*\d+/i.test(
        line,
      ),
    )
  ) {
    return "numbered";
  }

  if (
    lines.some((line) =>
      /^\s*;\s*LAYER_CHANGE\b/i.test(
        line,
      ),
    )
  ) {
    return "change";
  }

  if (
    lines.some((line) =>
      /^\s*;\s*Z:\s*[-+]?\d/i.test(
        line,
      ),
    )
  ) {
    return "z";
  }

  return "none";
}

function clampLayer(
  layer: number,
  totalLayers: number,
): number {
  return Math.min(
    Math.max(1, layer),

    Math.max(
      1,
      totalLayers,
    ),
  );
}

export function prepareCommands(
  lines: string[],
  totalLayers: number,
): PreparedCommand[] {
  const markerMode =
    detectLayerMarkerMode(lines);

  const commands:
    PreparedCommand[] = [];

  let currentLayer = 1;
  let sequentialLayer = 0;

  for (const rawLine of lines) {
    if (
      markerMode === "numbered"
    ) {
      const match = rawLine.match(
        /^\s*;\s*LAYER:\s*(\d+)/i,
      );

      if (match) {
        currentLayer =
          Number(match[1]) + 1;
      }
    } else if (
      markerMode === "change" &&
      /^\s*;\s*LAYER_CHANGE\b/i.test(
        rawLine,
      )
    ) {
      sequentialLayer++;

      currentLayer =
        Math.max(
          1,
          sequentialLayer,
        );
    } else if (
      markerMode === "z" &&
      /^\s*;\s*Z:\s*[-+]?\d/i.test(
        rawLine,
      )
    ) {
      sequentialLayer++;

      currentLayer =
        Math.max(
          1,
          sequentialLayer,
        );
    }

    const command =
      stripGcodeLine(rawLine);

    if (
      !command ||
      command === "%"
    ) {
      continue;
    }

    commands.push({
      text: command,

      layer: clampLayer(
        currentLayer,
        totalLayers,
      ),
    });
  }

  return commands;
}