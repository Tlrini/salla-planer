// n8ao ships plain JavaScript; only the part of its API this app uses is typed here.
declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import { Pass } from 'postprocessing';

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    autoDetectTransparency: boolean;
    configuration: {
      transparencyAware: boolean;
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      gammaCorrection: boolean;
      screenSpaceRadius: boolean;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
