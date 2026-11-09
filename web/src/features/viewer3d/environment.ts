import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { SkyName } from './lightPlan';

const BASE = `${import.meta.env.BASE_URL}env/`;

/**
 * "Ballroom" by Sergej Majboroda, Poly Haven, CC0 (bundled in web/public/env, no CDN).
 * A real room photo gives gold, glass and polished floors believable reflections.
 */
export const HDRI_URL = `${BASE}ballroom_1k.hdr`;

/** The outdoor skies ("Qwantani" by Greg Zaal and Jarod Guest, Poly Haven, CC0), for reflections. */
export const skyHdriUrl = (sky: SkyName): string => `${BASE}sky_${sky}.hdr`;

const hdris = new Map<string, Promise<THREE.DataTexture | null>>();
const loadedHdris = new Map<string, THREE.DataTexture>();

/**
 * Loads an HDRI once per page (shared by the live view and the off-screen renders).
 * Resolves to null if the file is missing; callers then keep the generated studio light.
 */
export function loadHdri(url: string = HDRI_URL): Promise<THREE.DataTexture | null> {
  let p = hdris.get(url);
  if (!p) {
    p = new HDRLoader()
      .loadAsync(url)
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        loadedHdris.set(url, tex);
        return tex;
      })
      .catch(() => null);
    hdris.set(url, p);
  }
  return p;
}

/** The HDRI if it has already finished loading. */
export function loadedHdri(url: string = HDRI_URL): THREE.DataTexture | null {
  return loadedHdris.get(url) ?? null;
}

const photos = new Map<SkyName, Promise<THREE.Texture | null>>();
const loadedPhotos = new Map<SkyName, THREE.Texture>();

/** The sharp picture of the sky behind the scene; the HDRI is too small to be looked at. */
export function loadSkyPhoto(sky: SkyName): Promise<THREE.Texture | null> {
  let p = photos.get(sky);
  if (!p) {
    p = new THREE.TextureLoader()
      .loadAsync(`${BASE}sky_${sky}.jpg`)
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        loadedPhotos.set(sky, tex);
        return tex;
      })
      .catch(() => null);
    photos.set(sky, p);
  }
  return p;
}

export function loadedSkyPhoto(sky: SkyName): THREE.Texture | null {
  return loadedPhotos.get(sky) ?? null;
}
