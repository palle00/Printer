import type {
  ParsedGcode,
} from "../../types/gcode";

import type {
  PrinterPosition,
} from "../../types/printer";

import {
  CameraController,
} from "./CameraController";

import {
  NozzleRenderer,
} from "./NozzleRenderer";

import {
  SceneRenderer,
} from "./sceneRenderer";

import {
  simplifyToolpath,
} from "./simplifyToolpath";

import {
  ToolpathRenderer,
} from "./ToolpathRenderer";

import {
  getSceneLayout,
} from "./toolpath";

const MAX_PREVIEW_SEGMENTS =
  150_000;

export class GcodeScene {
  private readonly sceneRenderer:
    SceneRenderer;

  private readonly cameraController:
    CameraController;

  private readonly toolpathRenderer:
    ToolpathRenderer;

  private readonly nozzleRenderer:
    NozzleRenderer;

  /*
   * Prevents the same ParsedGcode object from being
   * simplified again if the viewer rerenders.
   */
  private readonly simplifiedGcodes =
    new WeakSet<ParsedGcode>();

  private disposed = false;

  constructor(
    mount: HTMLDivElement,
  ) {
    this.sceneRenderer =
      new SceneRenderer(mount);

    this.cameraController =
      new CameraController(
        this.sceneRenderer.renderer,

        this.sceneRenderer
          .requestRender,
      );

    this.sceneRenderer.setCamera(
      this.cameraController.camera,
    );

    this.toolpathRenderer =
      new ToolpathRenderer(
        this.sceneRenderer.scene,

        this.sceneRenderer
          .requestRender,
      );

    this.nozzleRenderer =
      new NozzleRenderer(
        this.sceneRenderer.scene,

        this.sceneRenderer
          .requestRender,
      );

    this.sceneRenderer.requestRender();
  }

  async setGcode(
    gcode: ParsedGcode | null,
    signal: AbortSignal,
    onProgress?: (
      percent: number,
    ) => void,
  ): Promise<void> {
    if (this.disposed) {
      return;
    }

    if (
      gcode &&
      !this.simplifiedGcodes.has(
        gcode,
      )
    ) {
      const result =
        simplifyToolpath(
          gcode.segments,
          {
            targetSegments:
              MAX_PREVIEW_SEGMENTS,

            minimumSegmentLengthMm:
              0.01,

            connectionToleranceMm:
              0.002,

            initialAngleToleranceDegrees:
              0.5,

            maximumAngleToleranceDegrees:
              8,

            initialMaximumMergedLengthMm:
              3,

            maximumMergedLengthMm:
              40,
          },
        );

      /*
       * Replace the original array instead of creating
       * a second ParsedGcode copy.
       *
       * Once this function has finished, intermediate
       * segment objects that are no longer referenced
       * can be garbage-collected.
       */
      gcode.segments =
        result.segments;

      this.simplifiedGcodes.add(
        gcode,
      );

      console.info(
        [
          "[G-code preview]",

          result.originalCount
            .toLocaleString(),

          "segments →",

          result.simplifiedCount
            .toLocaleString(),

          `(${result.reductionPercent}% reduction)`,

          `angle ${result.angleToleranceDegrees.toFixed(2)}°`,

          `length ${result.maximumMergedLengthMm.toFixed(1)} mm`,

          result.targetLimitApplied
            ? "target limit applied"
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }

    if (signal.aborted) {
      return;
    }

    const layout =
      getSceneLayout(gcode);

    const loadToolpath =
      this.toolpathRenderer.setGcode(
        gcode,
        layout,
        signal,
        onProgress,
      );

    this.nozzleRenderer.setLayout(
      layout,
      gcode !== null,
    );

    this.cameraController.fitToLayout(
      layout,
    );

    await loadToolpath;

    if (
      signal.aborted ||
      this.disposed
    ) {
      return;
    }

    this.sceneRenderer.requestRender();
  }

  setPreviewLayer(
    layer: number,
  ): void {
    if (this.disposed) {
      return;
    }

    this.toolpathRenderer
      .setPreviewLayer(layer);
  }

  setPrintedCommand(
    command: number,
  ): void {
    if (this.disposed) {
      return;
    }

    this.toolpathRenderer
      .setPrintedCommand(command);
  }

  setNozzle(
    position: PrinterPosition,
    visible: boolean,
  ): void {
    if (this.disposed) {
      return;
    }

    this.nozzleRenderer.setPosition(
      position,
      visible,
    );
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.toolpathRenderer.dispose();
    this.nozzleRenderer.dispose();
    this.cameraController.dispose();
    this.sceneRenderer.dispose();
  }
}