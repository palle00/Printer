import {
  getNumberedLayer,
  isLayerChangeMarker,
  isZCommentMarker,
  type LayerMarkerMode,
} from "../layerMarkers";

export function updateCommentLayer(
  rawLine: string,
  mode: LayerMarkerMode,
  currentLayer: number,
): number {
  if (mode === "numbered") {
    const numberedLayer =
      getNumberedLayer(rawLine);

    if (numberedLayer !== null) {
      return Math.max(
        1,
        numberedLayer,
      );
    }
  }

  if (
    mode === "layer-change" &&
    isLayerChangeMarker(rawLine)
  ) {
    return currentLayer + 1;
  }

  if (
    mode === "z-comment" &&
    isZCommentMarker(rawLine)
  ) {
    return currentLayer + 1;
  }

  return currentLayer;
}
