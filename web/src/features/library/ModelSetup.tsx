import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import {
  formatDecimal,
  formatEUR,
  uniformModelSize,
  type CatalogCategory,
  type CatalogItem,
  type LibraryUpdate,
  type ModelBox,
  type ModelRotation,
} from '@salla/shared';
import { api } from '../../api/client';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { loadCatalog } from '../../model/bootstrap';
import { NumberField, SelectField, TextField } from '../editor/fields';
import { GlbModel } from '../viewer3d/GlbModel';
import { normalizeModel } from '../viewer3d/modelTransform';
import { renderModelImages } from './renderModel';

type DecorCategory = Exclude<CatalogCategory, 'structure'>;
const CATEGORIES: DecorCategory[] = ['floral', 'stage', 'lighting', 'tables', 'other'];
const TABLE_TOP = 0.75;
const ZERO: ModelRotation = { x: 0, y: 0, z: 0 };

const turn = (r: ModelRotation, axis: keyof ModelRotation, deg: number): ModelRotation => ({
  ...r,
  [axis]: (((r[axis] + deg) % 360) + 360) % 360,
});

/** Reports the size of the upright model (in its own units) whenever the rotation changes. */
function MeasureModel({
  url,
  rotation,
  onSize,
}: {
  url: string;
  rotation: ModelRotation;
  onSize: (box: ModelBox) => void;
}) {
  const gltf = useGLTF(url, false);
  useEffect(() => {
    const { size } = normalizeModel(gltf.scene, rotation);
    onSize({ x: size.x, y: size.y, z: size.z });
  }, [gltf.scene, rotation, onSize]);
  return null;
}

/** Re-aim the preview camera when the decor's size or the table under it changes. */
function FrameCamera({ reach, base, height }: { reach: number; base: number; height: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
  } | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const d = reach * 2.6;
    camera.position.set(d * 0.55, base + height * 0.6 + d * 0.35, d * 0.8);
    if (controls) {
      controls.target.set(0, base + height * 0.45, 0);
      controls.update();
    } else {
      camera.lookAt(0, base + height * 0.45, 0);
    }
    invalidate();
  }, [camera, controls, invalidate, reach, base, height]);
  return null;
}

function Preview({ cat, tabletop }: { cat: CatalogItem; tabletop: boolean }) {
  const reach = Math.max(cat.width, cat.depth, cat.height, 0.3);
  const base = tabletop ? TABLE_TOP : 0;
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 35, position: [reach * 1.6, base + reach * 1.3, reach * 2.4], near: 0.01 }}
    >
      <color attach="background" args={['#eef1f5']} />
      <hemisphereLight args={['#ffffff', '#b8b0a4', 2]} />
      <directionalLight position={[2, 4, 3]} intensity={2.2} />
      <gridHelper args={[4, 40, '#9aa6ba', '#d8dee7']} />
      {tabletop && (
        // A round 10-seat table under tabletop decor, for scale.
        <mesh position={[0, TABLE_TOP / 2, 0]}>
          <cylinderGeometry args={[0.9, 0.92, TABLE_TOP, 48]} />
          <meshStandardMaterial color="#ffffff" roughness={0.9} />
        </mesh>
      )}
      <group position={[0, base, 0]}>
        <GlbModel cat={cat} item={cat} />
      </group>
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.02} />
      <FrameCamera reach={reach} base={base} height={cat.height} />
    </Canvas>
  );
}

interface Props {
  item: CatalogItem | null;
  onClose: () => void;
}

/**
 * "Rregullimi i dekorit": make an uploaded scan upright, give it its real height (width and
 * depth follow from the scan), name, price and category, then save it with rendered thumbnails.
 */
export function ModelSetup({ item, onClose }: Props) {
  return (
    <Modal open={!!item} title={sq.library.setupTitle} onClose={onClose} wide>
      {item && <SetupForm key={item.id} item={item} onClose={onClose} />}
    </Modal>
  );
}

function SetupForm({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<DecorCategory>(
    item.category === 'structure' ? 'floral' : item.category,
  );
  const [height, setHeight] = useState(item.height);
  const [price, setPrice] = useState(item.price);
  const [stock, setStock] = useState<number | undefined>(item.stock);
  const [tabletop, setTabletop] = useState(!!item.tabletop);
  const [shape, setShape] = useState(item.shape2d);
  const [rotation, setRotation] = useState<ModelRotation>(item.modelRotation ?? ZERO);
  const [box, setBox] = useState<ModelBox | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [modelFailed, setModelFailed] = useState(false);

  const size = box ? uniformModelSize(box, height) : null;
  // What the preview renders: the current form values, not the saved ones.
  const previewCat = useMemo<CatalogItem>(
    () => ({
      ...item,
      modelRotation: rotation,
      scaleMode: 'uniform',
      height,
      width: size?.width || item.width,
      depth: size?.depth || item.depth,
    }),
    [item, rotation, height, size?.width, size?.depth],
  );

  const save = async () => {
    if (!size || !name.trim()) return;
    setState('saving');
    try {
      const patch: LibraryUpdate = {
        name: name.trim(),
        category,
        height,
        width: size.width,
        depth: size.depth,
        price,
        // An emptied field must reach the server as "clear", not be dropped.
        stock: stock ?? null,
        tabletop,
        shape2d: shape,
        modelRotation: rotation,
        draft: false,
      };
      const saved = await api.put<CatalogItem>(`/api/library/${item.id}`, patch);
      try {
        const images = await renderModelImages(saved);
        await api.post(`/api/library/${item.id}/images`, images);
      } catch (err) {
        // The decor is usable without thumbnails; the plan then shows its outline only.
        console.error('thumbnail render failed', err);
      }
      await loadCatalog();
      onClose();
    } catch {
      setState('error');
    }
  };

  const rotateButtons: Array<{ label: string; axis: keyof ModelRotation }> = [
    { label: sq.library.turnUpright, axis: 'x' },
    { label: sq.library.turnSide, axis: 'z' },
    { label: sq.library.turnAround, axis: 'y' },
  ];

  return (
    <div className="model-setup">
      <div className="model-preview">
        {modelFailed ? (
          <p className="form-error">{sq.library.modelError}</p>
        ) : (
          <ErrorBoundary
            fallback={<p className="form-error">{sq.library.modelError}</p>}
            onError={() => setModelFailed(true)}
          >
            <Suspense fallback={<p className="muted center-fill">{sq.library.loadingModel}</p>}>
              <Preview cat={previewCat} tabletop={tabletop} />
            </Suspense>
            <Suspense fallback={null}>
              <MeasureModel url={item.modelFile!} rotation={rotation} onSize={setBox} />
            </Suspense>
          </ErrorBoundary>
        )}
        <p className="muted small">{sq.library.previewHint}</p>
      </div>

      <div className="model-form">
        <p className="muted small">{sq.library.setupHint}</p>
        <fieldset className="rotate-group">
          <legend>{sq.library.orientation}</legend>
          {rotateButtons.map(({ label, axis }) => (
            <div key={axis} className="rotate-row">
              <span>{label}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`${label} −90°`}
                onClick={() => setRotation((r) => turn(r, axis, -90))}
              >
                <RotateCcw size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`${label} +90°`}
                onClick={() => setRotation((r) => turn(r, axis, 90))}
              >
                <RotateCw size={18} />
              </button>
            </div>
          ))}
          <button type="button" className="btn" onClick={() => setRotation(ZERO)}>
            <Undo2 size={16} />
            <span>{sq.library.reset}</span>
          </button>
        </fieldset>

        <TextField label={sq.library.name} value={name} onCommit={setName} live />
        <SelectField
          label={sq.library.category}
          value={category}
          options={CATEGORIES.map((c) => ({ value: c, label: sq.categories[c] }))}
          onChange={setCategory}
        />
        <div className="form-grid">
          <NumberField
            label={sq.library.height}
            value={height}
            onCommit={(v) => v !== undefined && setHeight(v)}
            unit={sq.common.meters}
            min={0.02}
            max={10}
          />
          <NumberField
            label={sq.admin.stock}
            value={stock}
            decimals={0}
            min={0}
            max={100000}
            allowEmpty
            placeholder="—"
            onCommit={setStock}
          />
          <NumberField
            label={sq.library.price}
            value={price}
            onCommit={(v) => v !== undefined && setPrice(v)}
            unit="€"
            min={0}
            max={100000}
          />
        </div>
        <p className="mono small" data-testid="setup-size">
          {sq.library.size}:{' '}
          {size
            ? `${formatDecimal(size.width)} × ${formatDecimal(size.depth)} × ${formatDecimal(size.height)} ${sq.common.meters}`
            : '…'}
          {price > 0 && <> · {formatEUR(price)}</>}
        </p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={tabletop}
            onChange={(e) => setTabletop(e.target.checked)}
          />
          <span>{sq.library.tabletop}</span>
        </label>
        <SelectField
          label={sq.library.shape}
          value={shape}
          options={[
            { value: 'circle', label: sq.library.shapeCircle },
            { value: 'rect', label: sq.library.shapeRect },
          ]}
          onChange={setShape}
        />
        {state === 'error' && (
          <p className="form-error" role="alert">
            {sq.library.saveError}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {sq.common.cancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!size || !name.trim() || state === 'saving' || modelFailed}
            onClick={() => void save()}
          >
            {state === 'saving' ? sq.library.saving : sq.library.save}
          </button>
        </div>
      </div>
    </div>
  );
}
