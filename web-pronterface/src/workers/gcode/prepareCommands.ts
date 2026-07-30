export interface PreparedCommands {
  texts: string[];
  layers: Uint32Array<ArrayBufferLike>;
}

export {
  stripGcodeLine,
} from "../../gcode/commandLine";
import {
  stripGcodeLine,
} from "../../gcode/commandLine";

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
): PreparedCommands {
  const markerMode =
    detectLayerMarkerMode(lines);

  const texts: string[] = [];
  const layers =
    new Uint32Array(lines.length);
  let commandIndex = 0;

  let currentLayer = 1;
  let sequentialLayer = 0;

  for (const rawLine of lines) {
    if (
      markerMode === "numbered"
    ) {
      const numberedLayer =
        getNumberedLayer(rawLine);

      if (numberedLayer !== null) {
        currentLayer =
          numberedLayer;
      }
    } else if (
      markerMode === "layer-change" &&
      isLayerChangeMarker(rawLine)
    ) {
      sequentialLayer++;

      currentLayer =
        Math.max(
          1,
          sequentialLayer,
        );
    } else if (
      markerMode === "z-comment" &&
      isZCommentMarker(rawLine)
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

    texts.push(command);
    layers[commandIndex] = clampLayer(
      currentLayer,
      totalLayers,
    );
    commandIndex++;
  }

  return {
    texts,
    layers: layers.subarray(0, commandIndex),
  };
}
import {
  detectLayerMarkerMode,
  getNumberedLayer,
  isLayerChangeMarker,
  isZCommentMarker,
} from "../../gcode/layerMarkers";
