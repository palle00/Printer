import * as THREE from "three";
import type { SceneLayout } from "./toolpath";

function disposeMaterial(
  material:
    | THREE.Material
    | THREE.Material[],
): void {
  if (Array.isArray(material)) {
    material.forEach((item) => {
      item.dispose();
    });

    return;
  }

  material.dispose();
}

export function disposeObject(
  object: THREE.Object3D | null,
): void {
  if (!object) {
    return;
  }

  object.removeFromParent();

  object.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof
        THREE.LineSegments
    ) {
      child.geometry?.dispose();

      if (child.material) {
        disposeMaterial(
          child.material,
        );
      }
    }
  });
}

export function createBed(
  layout: SceneLayout,
): THREE.Mesh {
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(
      layout.bedWidth,
      2,
      layout.bedDepth,
    ),

    new THREE.MeshStandardMaterial({
      color: 0x121620,
      roughness: 0.9,
      metalness: 0.15,
    }),
  );

  bed.position.y = -1;

  return bed;
}

export function createGrid(
  layout: SceneLayout,
): THREE.GridHelper {
  const gridSize = Math.max(
    layout.bedWidth,
    layout.bedDepth,
  );

  const grid = new THREE.GridHelper(
    gridSize,
    Math.max(
      10,
      Math.round(gridSize / 10),
    ),
    0x3b82f6,
    0x263244,
  );

  grid.position.y = 0.02;

  return grid;
}

export function createNozzle(): THREE.Group {
  const nozzle = new THREE.Group();

  const heaterBlock = new THREE.Mesh(
    new THREE.BoxGeometry(7, 5, 7),

    new THREE.MeshStandardMaterial({
      color: 0x555b66,
      metalness: 0.85,
      roughness: 0.25,
    }),
  );

  heaterBlock.position.y = 8;
  nozzle.add(heaterBlock);

  const brassTip = new THREE.Mesh(
    new THREE.CylinderGeometry(
      1.5,
      0.22,
      6,
      16,
    ),

    new THREE.MeshStandardMaterial({
      color: 0xc58a2a,
      metalness: 0.8,
      roughness: 0.3,
    }),
  );

  brassTip.position.y = 3;
  nozzle.add(brassTip);

  const heatBreak = new THREE.Mesh(
    new THREE.CylinderGeometry(
      2.2,
      2.2,
      7,
      16,
    ),

    new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      metalness: 0.9,
      roughness: 0.2,
    }),
  );

  heatBreak.position.y = 14;
  nozzle.add(heatBreak);

  const positionIndicator =
    new THREE.Mesh(
      new THREE.TorusGeometry(
        3.5,
        0.3,
        8,
        24,
      ),

      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.9,
      }),
    );

  positionIndicator.rotation.x =
    Math.PI / 2;

  positionIndicator.position.y = 0.3;

  nozzle.add(positionIndicator);

  return nozzle;
}