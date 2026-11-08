import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { RotateCcw, RotateCw } from 'lucide-react';
import { formatMeters, type Hall, type HallTemplate, type ScanJob } from '@salla/shared';
import { api } from '../../api/client';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { NumberField, TextField } from '../editor/fields';
import { hallFromScan, PLAN_CUT_HEIGHT, planImageSize, validHallSize } from './hallFit';

const DEG = Math.PI / 180;
const GRID_COLOR = '#9aa6ba';
/** Same defaults as "Salla e re" on the halls page. */
const FLOOR_COLOR = '#B98A5E';
const WALL_COLOR = '#F3EBDD';
const UNDERLAY_OPACITY = 0.7;

interface Turn {
  /** Quarter turns that make the scan stand upright (degrees). */
  x: number;
  z: number;
  /** Free turn around the vertical axis so the walls run along the grid (degrees). */
  yaw: number;
}

interface Rig {
  root: THREE.Group;
  yawGroup: THREE.Group;
  upright: THREE.Group;
  /** Keep y ≤ PLAN_CUT_HEIGHT: the view from above then shows the floor plan, not the ceiling. */
  cut: THREE.Plane;
}

/** A copy of the scan inside three nested groups: upright turn → wall alignment → scale/offset. */
function buildRig(scene: THREE.Object3D): Rig {
  const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), PLAN_CUT_HEIGHT);
  const content = scene.clone(true);
  content.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const clip = (m: THREE.Material) => {
      const c = m.clone();
      c.clippingPlanes = [cut];
      c.side = THREE.DoubleSide;
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clip) : clip(mesh.material);
  });
  const upright = new THREE.Group();
  upright.add(content);
  const yawGroup = new THREE.Group();
  yawGroup.add(upright);
  const root = new THREE.Group();
  root.add(yawGroup);
  return { root, yawGroup, upright, cut };
}

/**
 * Apply the turn and the real height: afterwards the hall's floor corner is at the origin and
 * one unit is one meter (x = width, z = length). Returns the measured hall.
 */
function fitRig(rig: Rig, turn: Turn, realHeight: number) {
  rig.upright.rotation.set(turn.x * DEG, 0, turn.z * DEG);
  rig.yawGroup.rotation.set(0, turn.yaw * DEG, 0);
  rig.root.scale.setScalar(1);
  rig.root.position.set(0, 0, 0);
  rig.root.updateMatrixWorld(true);
  // Precise: the box of the turned vertices, not of the turned bounding box.
  const box = new THREE.Box3().setFromObject(rig.root, true);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const fit = hallFromScan(size, realHeight);
  rig.root.scale.setScalar(fit.scale);
  rig.root.position.set(-box.min.x * fit.scale, -box.min.y * fit.scale, -box.min.z * fit.scale);
  rig.root.updateMatrixWorld(true);
  return fit;
}

/** Top-down picture of the fitted scan, cut at PLAN_CUT_HEIGHT, transparent around the floor. */
async function renderPlan(rig: Rig, width: number, length: number): Promise<Blob> {
  const { w, h } = planImageSize(width, length);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.localClippingEnabled = true;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
    scene.add(rig.root.clone(true));
    const camera = new THREE.OrthographicCamera(
      -width / 2,
      width / 2,
      length / 2,
      -length / 2,
      0.1,
      500,
    );
    camera.position.set(width / 2, 100, length / 2);
    camera.up.set(0, 0, -1); // picture top = plan top (3D −z)
    camera.lookAt(width / 2, 0, length / 2);
    camera.updateMatrixWorld();
    // The first frame uploads textures; the second is the clean one.
    renderer.render(scene, camera);
    renderer.render(scene, camera);
    return await new Promise<Blob>((resolve, reject) =>
      renderer.domElement.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('plan render failed'))),
        'image/png',
      ),
    );
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

function LoadScan({ url, onLoaded }: { url: string; onLoaded: (scene: THREE.Object3D) => void }) {
  const gltf = useGLTF(url, false);
  useEffect(() => onLoaded(gltf.scene), [gltf.scene, onLoaded]);
  return null;
}

/** Applies the fit whenever turn or height change, and reports the result. */
function FitScan({
  rig,
  turn,
  height,
  onFit,
}: {
  rig: Rig;
  turn: Turn;
  height: number;
  onFit: (fit: { width: number; length: number } | null) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const fit = fitRig(rig, turn, height);
    onFit(fit ? { width: fit.width, length: fit.length } : null);
    invalidate();
  }, [rig, turn, height, onFit, invalidate]);
  return <primitive object={rig.root} />;
}

/** Orthographic camera straight down on [0, width] × [0, length], with the hall filling the view. */
function TopCamera({ width, length }: { width: number; length: number }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    camera.position.set(width / 2, 100, length / 2);
    camera.up.set(0, 0, -1);
    camera.lookAt(width / 2, 0, length / 2);
    camera.zoom = Math.min(size.width / (width * 1.1), size.height / (length * 1.1));
    camera.near = 0.1;
    camera.far = 500;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, width, length, invalidate]);
  return null;
}

/** 1 m grid over the hall (5 m lines stronger), so aligned walls run along the lines. */
function Grid({ width, length }: { width: number; length: number }) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const y = PLAN_CUT_HEIGHT + 0.01;
    for (let x = 0; x <= Math.ceil(width); x++) pts.push(x, y, 0, x, y, length);
    for (let z = 0; z <= Math.ceil(length); z++) pts.push(0, y, z, width, y, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [width, length]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={GRID_COLOR} transparent opacity={0.6} />
    </lineSegments>
  );
}

interface Props {
  job: ScanJob | null;
  onClose: () => void;
  onCreated: (template: HallTemplate) => void;
}

/** "Plani nga skanimi": measure a hall scan and turn it into a hall template with a plan photo. */
export function HallScanDialog({ job, onClose, onCreated }: Props) {
  return (
    <Modal open={!!job} title={sq.scan.hallTitle} onClose={onClose} wide>
      {job?.resultFile && (
        <HallForm
          key={job.id}
          job={job}
          url={job.resultFile}
          onClose={onClose}
          onCreated={onCreated}
        />
      )}
    </Modal>
  );
}

function HallForm({
  job,
  url,
  onClose,
  onCreated,
}: {
  job: ScanJob;
  url: string;
  onClose: () => void;
  onCreated: (template: HallTemplate) => void;
}) {
  const [scene, setScene] = useState<THREE.Object3D | null>(null);
  const rig = useMemo(() => (scene ? buildRig(scene) : null), [scene]);
  const [turn, setTurn] = useState<Turn>({ x: 0, z: 0, yaw: 0 });
  const [height, setHeight] = useState(4);
  const [name, setName] = useState(job.name);
  const [fit, setFit] = useState<{ width: number; length: number } | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [failed, setFailed] = useState(false);

  // The cloned materials belong to this dialog only.
  useEffect(
    () => () =>
      rig?.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
      }),
    [rig],
  );

  const quarter = (axis: 'x' | 'z', deg: number) =>
    setTurn((t) => ({ ...t, [axis]: (((t[axis] + deg) % 360) + 360) % 360 }));
  const sizeOk = !!fit && validHallSize(fit.width, fit.length);

  const create = async () => {
    if (!rig || !fit || !sizeOk || !name.trim()) return;
    setState('saving');
    try {
      const png = await renderPlan(rig, fit.width, fit.length);
      const form = new FormData();
      form.append('file', png, 'plani.png');
      const { url: planUrl } = await api.upload<{ url: string }>('/api/images', form);
      const hall: Hall = {
        name: name.trim().slice(0, 120),
        width: fit.width,
        length: fit.length,
        height,
        floor: 'parket',
        floorColor: FLOOR_COLOR,
        wallColor: WALL_COLOR,
        structure: [],
        underlay: {
          url: planUrl,
          x: 0,
          y: 0,
          width: fit.width,
          height: fit.length,
          opacity: UNDERLAY_OPACITY,
        },
      };
      onCreated(await api.post<HallTemplate>(`/api/scans/${job.id}/finish-hall`, { hall }));
    } catch (err) {
      console.error('creating the hall from the scan failed', err);
      setState('error');
    }
  };

  const view = fit ?? { width: 10, length: 10 };
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
                orthographic
                frameloop="demand"
                dpr={[1, 2]}
                onCreated={({ gl }) => {
                  gl.localClippingEnabled = true;
                }}
              >
                <color attach="background" args={['#1D3B6A']} />
                <ambientLight intensity={1.4} />
                <hemisphereLight args={['#ffffff', '#8a8a8a', 1.6]} />
                <LoadScan url={url} onLoaded={setScene} />
                {rig && <FitScan rig={rig} turn={turn} height={height} onFit={setFit} />}
                <Grid width={view.width} length={view.length} />
                <TopCamera width={view.width} length={view.length} />
              </Canvas>
            </Suspense>
          </ErrorBoundary>
        )}
        <p className="muted small mono" data-testid="hall-scan-size">
          {fit ? sq.scan.hallSize(formatMeters(fit.width), formatMeters(fit.length)) : '…'}
        </p>
      </div>

      <div className="model-form">
        <p className="muted small">{sq.scan.hallHint}</p>
        <fieldset className="rotate-group">
          <legend>{sq.library.orientation}</legend>
          {(
            [
              { label: sq.library.turnUpright, axis: 'x' },
              { label: sq.library.turnSide, axis: 'z' },
            ] as const
          ).map(({ label, axis }) => (
            <div key={axis} className="rotate-row">
              <span>{label}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`${label} −90°`}
                onClick={() => quarter(axis, -90)}
              >
                <RotateCcw size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`${label} +90°`}
                onClick={() => quarter(axis, 90)}
              >
                <RotateCw size={18} />
              </button>
            </div>
          ))}
          <label className="crop-range">
            <span className="small">{sq.scan.hallTurn}</span>
            <input
              type="range"
              min={-45}
              max={45}
              step={0.5}
              value={turn.yaw}
              disabled={!rig}
              onChange={(e) => setTurn((t) => ({ ...t, yaw: Number(e.target.value) }))}
            />
            <span className="mono small">{turn.yaw}°</span>
          </label>
        </fieldset>
        <TextField label={sq.scan.hallName} value={name} onCommit={setName} live />
        <NumberField
          label={sq.scan.hallHeight}
          value={height}
          onCommit={(v) => v !== undefined && setHeight(v)}
          unit={sq.common.meters}
          min={2}
          max={20}
        />
        {fit && !sizeOk && (
          <p className="form-error" role="alert">
            {sq.scan.hallTooBig}
          </p>
        )}
        {state === 'error' && (
          <p className="form-error" role="alert">
            {sq.scan.hallError}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {sq.common.cancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!sizeOk || !name.trim() || state === 'saving' || failed}
            onClick={() => void create()}
          >
            {state === 'saving' ? sq.scan.hallCreating : sq.scan.hallCreate}
          </button>
        </div>
      </div>
    </div>
  );
}
