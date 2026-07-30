import type {
  ParsedGcode,
} from "../../types/gcode";
import type {
  GcodeFeatureCategory,
} from "../../gcode/features";

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
} from "./WebglSceneRenderer";

import {
  ToolpathRenderer,
} from "./ToolpathRenderer";

import {
  getSceneLayout,
} from "./toolpath";

export class GcodeScene {
  private readonly sceneRenderer:
    SceneRenderer;

  private readonly cameraController:
    CameraController;

  private readonly toolpathRenderer:
    ToolpathRenderer;

  private readonly nozzleRenderer:
    NozzleRenderer;

  private disposed = false;

  constructor(
    mount: HTMLDivElement,
    featureVisibility:
      Readonly<
        Record<
          GcodeFeatureCategory,
          boolean
        >
      >,
  ) {
    this.sceneRenderer =
      new SceneRenderer(mount);

    this.cameraController =
      new CameraController(
        this.sceneRenderer.renderer,
        this.sceneRenderer.requestRender,
      );

    this.sceneRenderer.setCamera(
      this.cameraController.camera,
    );

    this.toolpathRenderer =
      new ToolpathRenderer(
        this.sceneRenderer.scene,
        this.sceneRenderer.requestRender,
        featureVisibility,
      );

    this.nozzleRenderer =
      new NozzleRenderer(
        this.sceneRenderer.scene,
        this.sceneRenderer.requestRender,
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
    if (
      this.disposed ||
      signal.aborted
    ) {
      return;
    }

    const layout =
      getSceneLayout(gcode);

    /*
     * Pass the original paths to the renderer.
     *
     * Performance optimisation must happen while
     * constructing GPU buffers—not by changing the
     * shape of the print.
     */
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
      this.disposed ||
      signal.aborted
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

    this.toolpathRenderer.setPreviewLayer(
      layer,
    );
  }

  setPrintedCommand(
    command: number,
  ): void {
    if (this.disposed) {
      return;
    }

    this.toolpathRenderer.setPrintedCommand(
      command,
    );
  }

  setFeatureVisibility(
    visibility:
      Readonly<
        Record<
          GcodeFeatureCategory,
          boolean
        >
      >,
  ): void {
    if (this.disposed) {
      return;
    }

    this.toolpathRenderer
      .setFeatureVisibility(
        visibility,
      );
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
