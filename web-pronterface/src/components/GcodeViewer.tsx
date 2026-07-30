import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { ParsedGcode } from "../types/gcode";
import type { PrinterPosition } from "../types/printer";
import type {
  GcodeFeatureCategory,
} from "../gcode/features";
import { GcodeScene } from "./gcode-viewer/GcodeScene";

interface GcodeViewerProps {
  gcode: ParsedGcode | null;
  previewLayer: number;
  printedCommand: number;
  position: PrinterPosition;
  showNozzle: boolean;
  featureVisibility:
    Readonly<
      Record<
        GcodeFeatureCategory,
        boolean
      >
    >;
}

export default function GcodeViewer({
  gcode,
  previewLayer,
  printedCommand,
  position,
  showNozzle,
  featureVisibility,
}: GcodeViewerProps) {
  const mountRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const sceneRef =
    useRef<GcodeScene | null>(
      null,
    );
  const initialVisibility =
    useRef(featureVisibility);

  const [
    buildProgress,
    setBuildProgress,
  ] = useState<number | null>(null);

  const [
    buildError,
    setBuildError,
  ] = useState<string | null>(null);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return;
    }

    const scene =
      new GcodeScene(
        mount,
        initialVisibility.current,
      );

    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;

    if (!scene) {
      return;
    }

    const controller =
      new AbortController();

    setBuildError(null);

    setBuildProgress(
      gcode ? 0 : null,
    );

    void scene
      .setGcode(
        gcode,
        controller.signal,
        (percent) => {
          if (
            !controller.signal.aborted
          ) {
            setBuildProgress(percent);
          }
        },
      )
      .then(() => {
        if (
          !controller.signal.aborted
        ) {
          setBuildProgress(null);
        }
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        setBuildProgress(null);

        setBuildError(
          error instanceof Error
            ? error.message
            : "Unable to build G-code preview.",
        );
      });

    return () => {
      controller.abort();
    };
  }, [gcode]);

  useEffect(() => {
    sceneRef.current?.setPreviewLayer(
      previewLayer,
    );
  }, [previewLayer]);

  useEffect(() => {
    sceneRef.current?.setPrintedCommand(
      printedCommand,
    );
  }, [printedCommand]);

  useEffect(() => {
    sceneRef.current
      ?.setFeatureVisibility(
        featureVisibility,
      );
  }, [featureVisibility]);

  useEffect(() => {
    sceneRef.current?.setNozzle(
      position,
      showNozzle,
    );
  }, [
    position.x,
    position.y,
    position.z,
    position.e,
    showNozzle,
  ]);

  return (
    <div className="absolute inset-0">
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full"
      />

      {buildProgress !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="w-56 rounded border border-gray-700 bg-[#121620]/95 p-3">
            <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-2">
              <span>
                Building preview
              </span>

              <span className="text-blue-400">
                {buildProgress}%
              </span>
            </div>

            <div className="h-1.5 overflow-hidden rounded bg-black">
              <div
                className="h-full bg-blue-600 transition-[width] duration-100"
                style={{
                  width: `${buildProgress}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {buildError && (
        <div className="absolute left-3 right-3 top-3 rounded border border-red-900 bg-red-950/90 px-3 py-2 text-xs text-red-300">
          {buildError}
        </div>
      )}
    </div>
  );
}
