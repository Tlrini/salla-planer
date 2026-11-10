import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Undo2 } from 'lucide-react';
import type { CatalogItem, ScanJob } from '@salla/shared';
import { api } from '../../api/client';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { loadCatalog } from '../../model/bootstrap';
import {
  cropBounds,
  FULL_CROP,
  keptTriangles,
  setCropEnd,
  type Bounds,
  type CropFractions,
} from './crop';

const GOLD = '#C9A44C';

interface Loaded {
  scene: THREE.Object3D;
  bounds: Bounds;
}

const toBounds = (b: THREE.Box3): Bounds => ({
  min: { x: b.min.x, y: b.min.y, z: b.min.z },
  max: { x: b.max.x, y: b.max.y, z: b.max.z },
});

/**
 * A copy of `source` with only the triangles inside `box`, as a binary glTF; null when nothing
 * is left. Geometries are copied, the loaded model itself is not changed.
 */
async function exportCropped(source: THREE.Object3D, box: Bounds): Promise<ArrayBuffer | null> {
  const root = source.clone(true);
  root.updateMatrixWorld(true);
  const emptied: THREE.Object3D[] = [];
  const v = new THREE.Vector3();
  let kept = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    if (!position) {
      emptied.push(mesh);
      return;
    }
    const world = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      world[i * 3] = v.x;
      world[i * 3 + 1] = v.y;
      world[i * 3 + 2] = v.z;
    }
    const index = geometry.getIndex();
    const keep = keptTriangles(world, index ? index.array : null, box);
    if (keep.length === 0) {
      emptied.push(mesh);
      return;
    }
    const cropped = geometry.clone();
    cropped.setIndex(keep);
    // Scan meshes have one material each; groups would point into the old index.
    cropped.clearGroups();
    mesh.geometry = cropped;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material[0]!;
    kept += keep.length / 3;
  });
  for (const o of emptied) o.removeFromParent();
  if (kept === 0) return null;
  const glb = await new GLTFExporter().parseAsync(root, { binary: true });
  return glb as ArrayBuffer;
}

/** Loads the worker's model and reports it with its bounding box. */
function LoadModel({ url, onLoaded }: { url: string; onLoaded: (l: Loaded) => void }) {
  const gltf = useGLTF(url, false);
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    if (box.isEmpty()) throw new Error('empty scan model');
    onLoaded({ scene: gltf.scene, bounds: toBounds(box) });
  }, [gltf.scene, onLoaded]);
  return null;
}

/** The model clipped to the crop box (live preview) with the box drawn around it. */
function CropPreview({ source, box }: { source: Loaded; box: Bounds }) {
  const invalidate = useThree((s) => s.invalidate);
  const planes = useMemo(() => Array.from({ length: 6 }, () => new THREE.Plane()), []);
  // A copy with its own materials, so the clipping never reaches the cached model.
  const preview = useMemo(() => {
    const copy = source.scene.clone(true);
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const clip = (m: THREE.Material) => {
        const c = m.clone();
        c.clippingPlanes = planes;
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clip) : clip(mesh.material);
    });
    return copy;
  }, [source.scene, planes]);

  useEffect(
    () => () =>
      preview.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
      }),
    [preview],
  );

  useEffect(() => {
    // Keep x ≥ min.x (normal +x), x ≤ max.x (normal −x), and the same for y and z.
    planes[0]!.set(new THREE.Vector3(1, 0, 0), -box.min.x);
    planes[1]!.set(new THREE.Vector3(-1, 0, 0), box.max.x);
    planes[2]!.set(new THREE.Vector3(0, 1, 0), -box.min.y);
    planes[3]!.set(new THREE.Vector3(0, -1, 0), box.max.y);
    planes[4]!.set(new THREE.Vector3(0, 0, 1), -box.min.z);
    planes[5]!.set(new THREE.Vector3(0, 0, -1), box.max.z);
    invalidate();
  }, [planes, box, invalidate]);

  const size: [number, number, number] = [
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  ];
  const center: [number, number, number] = [
    (box.min.x + box.max.x) / 2,
    (box.min.y + box.max.y) / 2,
    (box.min.z + box.max.z) / 2,
  ];
  return (
    <>
      <primitive object={preview} />
      <mesh position={center}>
        <boxGeometry args={size} />
        <meshBasicMaterial color={GOLD} wireframe />
      </mesh>
    </>
  );
}

/** Point the camera at the whole model once it is loaded. */
function FrameCamera({ bounds }: { bounds: Bounds }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
  } | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const cx = (bounds.min.x + bounds.max.x) / 2;
    const cy = (bounds.min.y + bounds.max.y) / 2;
    const cz = (bounds.min.z + bounds.max.z) / 2;
    const reach = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
      0.01,
    );
    camera.position.set(cx + reach * 1.2, cy + reach * 0.9, cz + reach * 1.6);
    camera.near = reach / 100;
    camera.far = reach * 100;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(cx, cy, cz);
      controls.update();
    } else {
      camera.lookAt(cx, cy, cz);
    }
    invalidate();
  }, [camera, controls, invalidate, bounds]);
  return null;
}

interface Props {
  job: ScanJob | null;
  onClose: () => void;
  /** The scan became a draft library decor; the caller opens its setup dialog. */
  onFinished: (item: CatalogItem) => void;
  /** An AI scan went back to make another model. */
  onRegenerated: () => void;
}

/**
 * "Pastrimi i modelit": cut the table and floor away from a scan before it goes to the library.
 * An AI model is already only the object: the agent just looks at it, keeps it or asks for another.
 */
export function CropDialog({ job, onClose, onFinished, onRegenerated }: Props) {
  return (
    <Modal
      open={!!job}
      title={job?.method === 'ai' ? sq.scan.aiPreviewTitle : sq.scan.cropTitle}
      onClose={onClose}
      wide
    >
      {job?.resultFile && (
        <CropForm
          key={job.id}
          job={job}
          url={job.resultFile}
          onClose={onClose}
          onFinished={onFinished}
          onRegenerated={onRegenerated}
        />
      )}
    </Modal>
  );
}

const AXES = [
  { key: 'x', label: sq.scan.axisX },
  { key: 'y', label: sq.scan.axisY },
  { key: 'z', label: sq.scan.axisZ },
] as const;

function CropForm({
  job,
  url,
  onClose,
  onFinished,
  onRegenerated,
}: {
  job: ScanJob;
  url: string;
  onClose: () => void;
  onFinished: (item: CatalogItem) => void;
  onRegenerated: () => void;
}) {
  const ai = job.method === 'ai';
  const [source, setSource] = useState<Loaded | null>(null);
  const [crop, setCrop] = useState<CropFractions>(FULL_CROP);
  const [state, setState] = useState<'idle' | 'saving' | 'error' | 'empty'>('idle');
  const [failed, setFailed] = useState(false);
  const box = useMemo(() => (source ? cropBounds(source.bounds, crop) : null), [source, crop]);

  const again = async () => {
    setState('saving');
    try {
      await api.post(`/api/scans/${job.id}/regenerate`, {});
      onRegenerated();
    } catch (err) {
      console.error('asking for another AI model failed', err);
      setState('error');
    }
  };

  const save = async () => {
    if (!source || !box) return;
    setState('saving');
    try {
      // An AI model is kept exactly as it came; only a cut scan has to be written again.
      const glb = ai
        ? await fetch(url).then((r) => r.arrayBuffer())
        : await exportCropped(source.scene, box);
      if (!glb) {
        setState('empty');
        return;
      }
      const form = new FormData();
      form.append('file', new Blob([glb], { type: 'model/gltf-binary' }), 'skanim.glb');
      const item = await api.upload<CatalogItem>(`/api/scans/${job.id}/finish`, form);
      await loadCatalog();
      onFinished(item);
    } catch (err) {
      console.error('saving the cropped scan failed', err);
      setState('error');
    }
  };

  return (
    <div className="model-setup">
      <div className="model-preview">
        {failed ? (
          <p className="form-error">{sq.scan.loadError}</p>
        ) : (
          <ErrorBoundary
            fallback={<p className="form-error">{sq.scan.loadError}</p>}
            onError={() => setFailed(true)}
          >
            <Suspense fallback={<p className="muted center-fill">{sq.library.loadingModel}</p>}>
              <Canvas
                frameloop="demand"
                dpr={[1, 2]}
                camera={{ fov: 35, position: [2, 1.5, 3] }}
                onCreated={({ gl }) => {
                  gl.localClippingEnabled = true;
                }}
              >
                <color attach="background" args={['#eef1f5']} />
                <hemisphereLight args={['#ffffff', '#b8b0a4', 2]} />
                <directionalLight position={[2, 4, 3]} intensity={2.2} />
                <LoadModel url={url} onLoaded={setSource} />
                {source && (ai ? <primitive object={source.scene} /> : null)}
                {source && box && !ai && <CropPreview source={source} box={box} />}
                {source && <FrameCamera bounds={source.bounds} />}
                <OrbitControls makeDefault />
              </Canvas>
            </Suspense>
          </ErrorBoundary>
        )}
        <p className="muted small">{sq.library.previewHint}</p>
      </div>

      <div className="model-form">
        {ai ? (
          <p className="muted small">{sq.scan.aiPreviewHint}</p>
        ) : (
          <>
            <p className="muted small">{sq.scan.cropHint}</p>
            {AXES.map(({ key, label }) => (
              <fieldset key={key} className="crop-axis">
                <legend>{label}</legend>
                {([0, 1] as const).map((end) => (
                  <label key={end} className="crop-range">
                    <span>{end === 0 ? sq.scan.from : sq.scan.to}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(crop[key][end] * 100)}
                      disabled={!source}
                      onChange={(e) => {
                        const value = Number(e.target.value) / 100;
                        setCrop((c) => ({ ...c, [key]: setCropEnd(c[key], end, value) }));
                      }}
                    />
                    <span className="mono small">{Math.round(crop[key][end] * 100)}%</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <button type="button" className="btn" onClick={() => setCrop(FULL_CROP)}>
              <Undo2 size={16} />
              <span>{sq.scan.cropReset}</span>
            </button>
          </>
        )}
        {(state === 'error' || state === 'empty') && (
          <p className="form-error" role="alert">
            {state === 'empty' ? sq.scan.cropEmpty : sq.scan.cropError}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {sq.common.cancel}
          </button>
          {ai && (
            <button
              type="button"
              className="btn"
              disabled={state === 'saving'}
              onClick={() => void again()}
            >
              {sq.scan.aiAgain}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!source || state === 'saving' || failed}
            onClick={() => void save()}
          >
            {state === 'saving' ? sq.scan.cropSaving : ai ? sq.scan.aiSave : sq.scan.cropSave}
          </button>
        </div>
      </div>
    </div>
  );
}
