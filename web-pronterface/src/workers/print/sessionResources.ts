import type {
  PrintSession,
} from "./sessionTypes";

export function releaseSessionResources(
  session: PrintSession,
): void {
  if (session.mode === "real") {
    void session.commandSource
      ?.close();
    session.commandSource = null;
    session.commandLayers =
      new Uint32Array(0);
    session.timing
      .cumulativeSeconds =
      new Float32Array(0);
    return;
  }

  session.path = {
    coordinates:
      new Float32Array(0),
    commandIndexes:
      new Uint32Array(0),
    layers:
      new Uint32Array(0),
    extruding:
      new Uint8Array(0),
  };
}
