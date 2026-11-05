import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Eye, Moon, Rotate3d, Sun, View } from 'lucide-react';
import { sq } from '../../i18n/sq';
import { catalogMap, useEditor } from '../../model/store';
import { useUi, type CameraPreset } from '../../model/ui';
import { useDebounced } from '../../model/useDebounced';
import { CameraRig } from './CameraRig';
import { CAMERA_FOV } from './cameras';
import { HallScene } from './HallScene';

const PRESETS: Array<{ id: CameraPreset; label: string; icon: typeof Eye }> = [
  { id: 'top', label: sq.viewer.top, icon: View },
  { id: 'perspective', label: sq.viewer.perspective, icon: Rotate3d },
  { id: 'entrance', label: sq.viewer.entrance, icon: Eye },
];

/** Live 3D view of the open project (view-only). Updates ~150 ms after 2D edits. */
export default function Viewer3D() {
  const liveHall = useEditor((s) => s.project.hall);
  const liveItems = useEditor((s) => s.project.items);
  const hall = useDebounced(liveHall, 150);
  const items = useDebounced(liveItems, 150);
  const kind = useEditor((s) => s.meta?.kind ?? 'project');
  // Hall templates: the edited items are the hall's structure.
  const scene = useMemo(
    () => (kind === 'hall' ? { hall: { ...hall, structure: items }, items: [] } : { hall, items }),
    [kind, hall, items],
  );
  const evening = useUi((s) => s.evening);
  const camera = useUi((s) => s.camera);
  const nonce = useUi((s) => s.cameraNonce);
  const set = useUi((s) => s.set);
  const size = Math.max(hall.width, hall.length);

  return (
    <div className="viewer3d">
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{
          fov: CAMERA_FOV,
          near: 0.05,
          far: 600,
          position: [hall.width / 2, 20, hall.length * 1.6],
        }}
        onCreated={(state) => {
          // Dev-only handle used to measure render performance from the console.
          if (import.meta.env.DEV) (window as unknown as { __salla3d: unknown }).__salla3d = state;
        }}
      >
        <HallScene project={scene} catalog={catalogMap} evening={evening} />
        <OrbitControls
          makeDefault
          maxPolarAngle={Math.PI / 2 - 0.03}
          minDistance={0.3}
          maxDistance={size * 3}
          enableDamping={false}
        />
        <CameraRig preset={camera} hall={hall} items={items} nonce={nonce} />
      </Canvas>

      <div className="viewer-controls" role="toolbar">
        <div className="control-group">
          <button
            type="button"
            className="text-btn"
            aria-pressed={!evening}
            onClick={() => set({ evening: false })}
          >
            <Sun size={18} />
            <span>{sq.viewer.day}</span>
          </button>
          <button
            type="button"
            className="text-btn"
            aria-pressed={evening}
            onClick={() => set({ evening: true })}
          >
            <Moon size={18} />
            <span>{sq.viewer.evening}</span>
          </button>
        </div>
        <div className="control-group">
          {PRESETS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="text-btn"
              aria-pressed={camera === id}
              onClick={() => set({ camera: id, cameraNonce: useUi.getState().cameraNonce + 1 })}
              title={label}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
