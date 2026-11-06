import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export interface EffectsOptions {
  evening: boolean;
  /** `live`: fewer AO samples for the interactive view; `export`: full quality, offline. */
  detail: 'live' | 'export';
}

/**
 * The "E lartë" image pipeline, shared by the live view and the off-screen exports so the PDF,
 * PNG and video look like what the client saw:
 * scene (HDR) → ambient occlusion → bloom (evening) + ACES tone mapping → SMAA.
 * All sizes are in meters (the scene's unit).
 */
export function createComposer(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  { evening, detail }: EffectsOptions,
): EffectComposer {
  const composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  // Soft contact darkening in corners, under tables and between chairs.
  const ao = new N8AOPostPass(scene, camera, 1, 1);
  // n8ao's half-resolution mode breaks on three ≥ 0.18x (its multi-target texture getter), so
  // the live view saves time with fewer samples instead.
  ao.setQualityMode(detail === 'live' ? 'Low' : 'Ultra');
  ao.configuration.aoRadius = 1.5;
  ao.configuration.distanceFalloff = 1;
  ao.configuration.intensity = evening ? 4 : 6;
  // Later passes tone-map and convert to sRGB.
  ao.configuration.gammaCorrection = false;
  if (detail === 'live') {
    // Glass and light washes would make n8ao render the scene twice more per frame (~2× cost
    // on an Intel Iris Xe); their contact shadows aren't worth it while orbiting.
    ao.autoDetectTransparency = false;
    ao.configuration.transparencyAware = false;
  }
  composer.addPass(ao);

  const effects = [];
  // Only emissive parts (flames, crystals, uplights, light curtains) are brighter than 1.
  if (evening)
    effects.push(
      new BloomEffect({
        mipmapBlur: true,
        luminanceThreshold: 1,
        luminanceSmoothing: 0.25,
        intensity: 1.1,
        radius: 0.7,
      }),
    );
  effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
  composer.addPass(new EffectPass(camera, ...effects));
  // Edge smoothing on the final, tone-mapped image.
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
  return composer;
}
