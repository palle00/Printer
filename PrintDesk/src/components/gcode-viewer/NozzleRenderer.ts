import * as THREE from "three";

import type {
  PrinterPosition,
} from "../../types/printer";

import {
  PRINTED_FILAMENT_RADIUS,
  type SceneLayout,
} from "./toolpath";

import {
  createNozzle,
  disposeObject,
} from "./sceneObjects";

export class NozzleRenderer {
  private readonly nozzle:
    THREE.Group;

  private layout:
    SceneLayout | null = null;

  private hasGcode = false;
  private disposed = false;

  constructor(
    scene: THREE.Scene,

    private readonly requestRender:
      () => void,
  ) {
    this.nozzle =
      createNozzle();

    this.nozzle.visible = false;

    scene.add(this.nozzle);
  }

  setLayout(
    layout: SceneLayout,
    hasGcode: boolean,
  ): void {
    this.layout = layout;
    this.hasGcode = hasGcode;

    if (!hasGcode) {
      this.hide();
    }
  }

  setPosition(
    position: PrinterPosition,
    visible: boolean,
  ): void {
    if (
      this.disposed ||
      !visible ||
      !this.hasGcode ||
      !this.layout
    ) {
      this.hide();
      return;
    }

    this.nozzle.visible = true;

    /*
     * The simulation already supplies an
     * interpolated position. Do not apply another
     * lerp here, because that makes the nozzle lag.
     */
    this.nozzle.position.set(
      position.x -
        this.layout.centerX,

      Math.max(
        PRINTED_FILAMENT_RADIUS,

        position.z -
          this.layout.minZ +
          PRINTED_FILAMENT_RADIUS,
      ),

      this.layout.centerY -
        position.y,
    );

    this.requestRender();
  }

  hide(): void {
    if (!this.nozzle.visible) {
      return;
    }

    this.nozzle.visible = false;

    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.nozzle.removeFromParent();

    disposeObject(this.nozzle);

    this.layout = null;
  }
}