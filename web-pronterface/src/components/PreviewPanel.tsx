import {
  useEffect,
  useState,
} from "react";
import type { ParsedGcode } from "../types/gcode";
import type {
  PrintProgress,
  PrinterPosition,
} from "../types/printer";
import GcodeViewer from "./GcodeViewer";

interface PreviewPanelProps {
  gcode: ParsedGcode | null;
  progress: PrintProgress;
  position: PrinterPosition;
  connected: boolean;
  isTestMode: boolean;
  hasActivePrint: boolean;
}

export default function PreviewPanel({
  gcode,
  progress,
  position,
  connected,
  isTestMode,
  hasActivePrint,
}: PreviewPanelProps) {
  const [
    previewLayer,
    setPreviewLayer,
  ] = useState(1);

  const [
    followPrinterLayer,
    setFollowPrinterLayer,
  ] = useState(true);

  useEffect(() => {
    setPreviewLayer(
      gcode?.totalLayers ?? 1,
    );
  }, [gcode]);

  useEffect(() => {
    if (
      !followPrinterLayer ||
      !hasActivePrint ||
      !gcode
    ) {
      return;
    }

    setPreviewLayer(
      Math.min(
        gcode.totalLayers,
        Math.max(
          1,
          progress.currentLayer,
        ),
      ),
    );
  }, [
    followPrinterLayer,
    hasActivePrint,
    gcode,
    progress.currentLayer,
  ]);

  return (
    <section className="xl:col-span-6 bg-[#121620] border border-gray-800 rounded-lg flex flex-col overflow-hidden min-h-[600px]">
      <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center gap-4">
        <div>
          <h2 className="text-xs uppercase tracking-wider font-bold text-gray-400">
            G-code Preview
          </h2>

          {gcode && (
            <div className="text-[10px] font-mono text-gray-600 mt-1">
              X {gcode.minX.toFixed(1)}–
              {gcode.maxX.toFixed(1)}
              {" · "}Y{" "}
              {gcode.minY.toFixed(1)}–
              {gcode.maxY.toFixed(1)}
              {" · "}Z{" "}
              {gcode.minZ.toFixed(1)}–
              {gcode.maxZ.toFixed(1)}
            </div>
          )}
        </div>

        {gcode && (
          <div className="w-64">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2">
                <input
                  id="follow-printer-layer"
                  type="checkbox"
                  checked={followPrinterLayer}
                  onChange={(event) => {
                    const enabled =
                      event.target.checked;

                    setFollowPrinterLayer(
                      enabled,
                    );

                    if (
                      enabled &&
                      hasActivePrint
                    ) {
                      setPreviewLayer(
                        Math.min(
                          gcode.totalLayers,
                          Math.max(
                            1,
                            progress.currentLayer,
                          ),
                        ),
                      );
                    }
                  }}
                  className="accent-blue-500"
                />

                <label
                  htmlFor="follow-printer-layer"
                  className="text-[10px] font-mono text-gray-400 cursor-pointer"
                >
                  Follow print layer
                </label>
              </div>

              <span className="text-[10px] font-mono text-blue-400">
                {previewLayer} /{" "}
                {gcode.totalLayers}
              </span>
            </div>

            <input
              type="range"
              min={1}
              max={Math.max(
                1,
                gcode.totalLayers,
              )}
              value={previewLayer}
              onChange={(event) => {
                setFollowPrinterLayer(false);

                setPreviewLayer(
                  Number(
                    event.target.value,
                  ),
                );
              }}
              className="w-full accent-blue-500"
            />
          </div>
        )}
      </div>

      <div className="relative flex-1 min-h-[500px]">
        <GcodeViewer
          gcode={gcode}
          previewLayer={previewLayer}
          printedCommand={
            progress.currentLine
          }
          position={position}
          showNozzle={
            connected || isTestMode
          }
        />

        {!gcode && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-mono text-gray-600">
              Load a G-code file to display
              the 3D preview
            </span>
          </div>
        )}

        {isTestMode && (
          <div className="absolute top-3 left-3 pointer-events-none">
            <div className="bg-purple-950/80 border border-purple-700 text-purple-300 rounded px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider">
              Test simulation
            </div>
          </div>
        )}

        {(connected || isTestMode) &&
          gcode && (
            <div className="absolute bottom-3 left-3 pointer-events-none bg-black/70 border border-gray-800 rounded px-3 py-2 text-[10px] font-mono text-gray-400">
              <div>
                X {position.x.toFixed(2)}
              </div>

              <div>
                Y {position.y.toFixed(2)}
              </div>

              <div>
                Z {position.z.toFixed(2)}
              </div>
            </div>
          )}
      </div>

      <div className="bg-[#181d2c] border-t border-gray-800 px-4 py-2 flex justify-between text-[10px] font-mono">
        <div className="flex gap-4">
          <span className="text-blue-400">
            ● PLANNED
          </span>

          <span className="text-orange-400">
            ● PRINTED
          </span>
        </div>

        <span className="text-gray-500">
          {gcode
            ? `${gcode.segments.length.toLocaleString()} segments`
            : "No file loaded"}
        </span>
      </div>
    </section>
  );
}