import * as THREE from 'three';
import type { CatalogItem, Item, ModelRotation } from '@salla/shared';
import { heightOf } from './builders/types';

const DEG = Math.PI / 180;

export interface NormalizedModel {
  /** Wrapper at the origin: content rotated upright, centered on x/z, standing on y = 0. */
  object: THREE.Group;
  /** Size of the upright content in the model's own units (x = width, y = height, z = depth). */
  size: THREE.Vector3;
}

/**
 * Clone an uploaded model, apply the catalog rotation (X, then Y, then Z) that makes it stand
 * upright and face forward, then center it on the floor. Scans come in any orientation and unit.
 */
export function normalizeModel(
  scene: THREE.Object3D,
  rotation: ModelRotation | undefined,
): NormalizedModel {
  const content = scene.clone(true);
  const rotated = new THREE.Group();
  rotated.add(content);
  if (rotation) rotated.rotation.set(rotation.x * DEG, rotation.y * DEG, rotation.z * DEG, 'XYZ');
  const wrapper = new THREE.Group();
  wrapper.add(rotated);
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrapper);
  const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  rotated.position.set(-center.x, box.isEmpty() ? 0 : -box.min.y, -center.z);
  wrapper.updateMatrixWorld(true);
  return { object: wrapper, size };
}

/**
 * Scale that turns the normalized model into the item's real size. 'uniform' (scanned decor)
 * keeps the scan's proportions from its height; 'stretch' fills width × height × depth.
 */
export function modelScale(
  size: THREE.Vector3,
  item: Pick<Item, 'width' | 'depth' | 'height'>,
  cat: CatalogItem,
): [number, number, number] {
  const h = heightOf(item as Item, cat) || 1;
  if (cat.scaleMode === 'uniform') {
    const s = h / (size.y || 1);
    return [s, s, s];
  }
  return [item.width / (size.x || 1), h / (size.y || 1), item.depth / (size.z || 1)];
}
