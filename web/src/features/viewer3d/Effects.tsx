import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createComposer } from './composer';

/**
 * Post-processing for the live 3D view ("E lartë"). Takes over rendering (frame priority 1),
 * so it keeps working with `frameloop="demand"`.
 */
export function Effects({ evening }: { evening: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const composer = useMemo(
    () => createComposer(gl, scene, camera, { evening, detail: 'live' }),
    [gl, scene, camera, evening],
  );
  useEffect(
    () => () => {
      composer.dispose();
      // EffectComposer turns automatic clearing off; plain rendering ("Normale") needs it.
      gl.autoClear = true;
    },
    [composer, gl],
  );

  // Resize right before drawing: resizing in an effect afterwards clears the canvas, and with
  // an on-demand frame loop nothing would draw it again (black view on first open).
  const sizedFor = useRef('');
  useFrame((state, delta) => {
    const key = `${state.size.width}x${state.size.height}@${state.viewport.dpr}`;
    if (sizedFor.current !== key) {
      composer.setSize(state.size.width, state.size.height, false);
      sizedFor.current = key;
    }
    composer.render(delta);
  }, 1);
  useEffect(() => {
    sizedFor.current = '';
  }, [composer]);
  return null;
}
