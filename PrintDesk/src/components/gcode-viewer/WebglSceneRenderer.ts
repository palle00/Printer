import * as THREE from "three";

export class SceneRenderer {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;

  private camera: THREE.PerspectiveCamera | null = null;
  private readonly resizeObserver: ResizeObserver;
  private renderFrame: number | null = null;
  private disposed = false;

  constructor(
    private readonly mount: HTMLDivElement,
  ) {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);

    this.scene.background = new THREE.Color(0x0b0e14);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 1.5),
    );
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.mount.replaceChildren(this.renderer.domElement);

    this.addLights();

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.mount);
  }

  setCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    this.updateCameraAspect();
    this.requestRender();
  }

  requestRender = (): void => {
    if (this.disposed || this.renderFrame !== null) {
      return;
    }

    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;
      this.renderNow();
    });
  };

  renderNow(): void {
    if (!this.disposed && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (this.renderFrame !== null) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }

    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.mount.replaceChildren();
  }

  private addLights(): void {
    const hemisphereLight = new THREE.HemisphereLight(
      0xffffff,
      0x182030,
      2,
    );
    const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
    const fillLight = new THREE.DirectionalLight(0x7aa2ff, 0.8);

    mainLight.position.set(180, 350, 220);
    fillLight.position.set(-180, 120, -100);
    this.scene.add(hemisphereLight, mainLight, fillLight);
  }

  private updateCameraAspect(): void {
    if (!this.camera) {
      return;
    }

    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private readonly handleResize = (): void => {
    if (this.disposed) {
      return;
    }

    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.renderer.setSize(width, height);
    this.updateCameraAspect();
    this.requestRender();
  };
}
