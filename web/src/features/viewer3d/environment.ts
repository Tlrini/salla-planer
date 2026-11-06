import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/**
 * "Ballroom" by Sergej Majboroda, Poly Haven, CC0 (bundled in web/public/env, no CDN).
 * A real room photo gives gold, glass and polished floors believable reflections.
 */
export const HDRI_URL = `${import.meta.env.BASE_URL}env/ballroom_1k.hdr`;

let promise: Promise<THREE.DataTexture | null> | null = null;
let loaded: THREE.DataTexture | null = null;

/**
 * Loads the HDRI once per page (shared by the live view and the off-screen renders).
 * Resolves to null if the file is missing; callers then keep the generated studio light.
 */
export function loadHdri(): Promise<THREE.DataTexture | null> {
  promise ??= new HDRLoader()
    .loadAsync(HDRI_URL)
    .then((tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      loaded = tex;
      return tex;
    })
    .catch(() => null);
  return promise;
}

/** The HDRI if it has already finished loading. */
export function loadedHdri(): THREE.DataTexture | null {
  return loaded;
}
