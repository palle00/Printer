import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type {
  SceneLayout,
} from "./toolpath";

const MAXIMUM_FPS = 30;
const FRAME_INTERVAL =
  1000 / MAXIMUM_FPS;

const CONTROL_SETTLE_FRAMES = 18;

const CAMERA_HORIZONTAL_DISTANCE = 0.8;
const CAMERA_VERTICAL_DISTANCE = 0.65;

export class CameraController {
  readonly camera:
    THREE.PerspectiveCamera;

  private readonly controls:
    OrbitControls;

  private controlsActive = false;
  private settleFrames = 0;

  private animationFrame:
    number | null = null;

  private lastFrameTime = 0;
  private disposed = false;

  constructor(
    renderer: THREE.WebGLRenderer,

    private readonly requestRender:
      () => void,
  ) {
    this.camera =
      new THREE.PerspectiveCamera(
        45,
        1,
        0.1,
        5000,
      );

    this.camera.position.set(
      260,
      220,
      260,
    );

    this.controls =
      new OrbitControls(
        this.camera,
        renderer.domElement,
      );

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.controls.screenSpacePanning =
      true;

    this.controls.target.set(
      0,
      20,
      0,
    );

    this.controls.update();

    this.controls.addEventListener(
      "start",
      this.handleControlsStart,
    );

    this.controls.addEventListener(
      "end",
      this.handleControlsEnd,
    );

    this.controls.addEventListener(
      "change",
      this.handleControlsChange,
    );
  }

  fitToLayout(
    layout: SceneLayout,
  ): void {
    const largestDimension =
      Math.max(
        1,
        layout.bedWidth,
        layout.bedDepth,
        layout.modelHeight * 3,
      );

    this.camera.position.set(
      largestDimension *
        CAMERA_HORIZONTAL_DISTANCE,

      largestDimension *
        CAMERA_VERTICAL_DISTANCE,

      largestDimension *
        CAMERA_HORIZONTAL_DISTANCE,
    );

    this.controls.target.set(
      0,
      layout.modelHeight / 2,
      0,
    );

    this.camera.lookAt(
      this.controls.target,
    );

    this.controls.update();
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (
      this.animationFrame !== null
    ) {
      cancelAnimationFrame(
        this.animationFrame,
      );

      this.animationFrame = null;
    }

    this.controls.removeEventListener(
      "start",
      this.handleControlsStart,
    );

    this.controls.removeEventListener(
      "end",
      this.handleControlsEnd,
    );

    this.controls.removeEventListener(
      "change",
      this.handleControlsChange,
    );

    this.controls.dispose();
  }

  private startAnimation(): void {
    if (
      this.disposed ||
      this.animationFrame !== null
    ) {
      return;
    }

    this.animationFrame =
      requestAnimationFrame(
        this.animate,
      );
  }

  private readonly animate = (
    timestamp: number,
  ): void => {
    this.animationFrame = null;

    if (this.disposed) {
      return;
    }

    const elapsed =
      timestamp -
      this.lastFrameTime;

    if (elapsed < FRAME_INTERVAL) {
      this.startAnimation();
      return;
    }

    this.lastFrameTime = timestamp;

    this.controls.update();
    this.requestRender();

    if (
      !this.controlsActive &&
      this.settleFrames > 0
    ) {
      this.settleFrames--;
    }

    if (
      this.controlsActive ||
      this.settleFrames > 0
    ) {
      this.startAnimation();
    }
  };

  private readonly handleControlsStart =
    (): void => {
      this.controlsActive = true;
      this.settleFrames = 0;

      this.startAnimation();
    };

  private readonly handleControlsEnd =
    (): void => {
      this.controlsActive = false;

      this.settleFrames =
        CONTROL_SETTLE_FRAMES;

      this.startAnimation();
    };

  private readonly handleControlsChange =
    (): void => {
      this.requestRender();
    };
}