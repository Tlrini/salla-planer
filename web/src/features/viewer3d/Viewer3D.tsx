import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import {
  Bookmark,
  BookmarkPlus,
  Circle,
  Eye,
  Footprints,
  Moon,
  Move,
  Orbit,
  Presentation,
  Rotate3d,
  RotateCcw,
  RotateCw,
  Sparkles,
  Square,
  Sun,
  View,
  X,
} from 'lucide-react';
import { walkArea } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { catalogMap, useCatalogVersion, useEditor } from '../../model/store';
import { useUi, type CameraPreset } from '../../model/ui';
import { useDebounced } from '../../model/useDebounced';
import { CameraRig } from './CameraRig';
import { useDrag3d } from './drag3d';
import { Drop3D, Edit3DControls } from './Edit3D';
import { SHADOW_MODE } from './composer';
import { Effects } from './Effects';
import { autoViewpoints, CAMERA_FOV, type Pose } from './cameras';
import { HallScene } from './HallScene';
import { WalkControls, type WalkApi } from './WalkControls';
import { recordTour, videoExtension, videoMimeType } from '../export/tour';
import { pdfFileName } from '../export/pdf';

const PRESETS: Array<{ id: CameraPreset; label: string; icon: typeof Eye }> = [
  { id: 'top', label: sq.viewer.top, icon: View },
  { id: 'perspective', label: sq.viewer.perspective, icon: Rotate3d },
  { id: 'entrance', label: sq.viewer.entrance, icon: Eye },
];

/** Live 3D view of the open project (view-only). Updates ~150 ms after 2D edits. */
/** `readOnly`: the client's share view (nothing can be saved there). */
export default function Viewer3D({ readOnly = false }: { readOnly?: boolean } = {}) {
  const liveHall = useEditor((s) => s.project.hall);
  const liveItems = useEditor((s) => s.project.items);
  const hall = useDebounced(liveHall, 150);
  const debouncedItems = useDebounced(liveItems, 150);
  // Items being dragged in the 3D view are drawn at their drag position right away.
  const preview = useDrag3d((s) => s.preview);
  const items = useMemo(
    () =>
      preview
        ? debouncedItems.map((i) => (preview[i.id] ? { ...i, ...preview[i.id] } : i))
        : debouncedItems,
    [debouncedItems, preview],
  );
  const viewpoints = useEditor((s) => s.project.viewpoints);
  const kind = useEditor((s) => s.meta?.kind ?? 'project');
  // Hall templates: the edited items are the hall's structure.
  const scene = useMemo(
    () => (kind === 'hall' ? { hall: { ...hall, structure: items }, items: [] } : { hall, items }),
    [kind, hall, items],
  );
  const edit3d = useUi((s) => s.edit3d) && !readOnly;
  const selectionCount = useEditor((s) => s.selection.length);
  const catalogVersion = useCatalogVersion();
  const evening = useUi((s) => s.evening);
  const camera = useUi((s) => s.camera);
  const nonce = useUi((s) => s.cameraNonce);
  const walk = useUi((s) => s.walk);
  const quality = useUi((s) => s.quality);
  const set = useUi((s) => s.set);
  const size = Math.max(hall.width, hall.length);

  const walkApi = useRef<WalkApi>(null);
  // Contact shadows render once; give them a new key whenever the layout changes.
  const [shadowKey, setShadowKey] = useState(0);
  useEffect(() => setShadowKey((k) => k + 1), [scene]);
  const [fading, setFading] = useState(false);
  const area = useMemo(
    () => walkArea(scene.hall, scene.items, catalogMap),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalog is mutated in place
    [scene, catalogVersion],
  );
  const autos = useMemo(() => autoViewpoints(scene.hall, scene.items), [scene]);
  // Where walking starts: kept stable so edits elsewhere don't teleport the visitor.
  const firstPose = () =>
    autos[0]?.pose ?? { x: hall.width / 2, y: hall.length - 1, yaw: 0, pitch: 0 };
  const [walkStart, setWalkStart] = useState<Pose | null>(() => (walk ? firstPose() : null));
  // Walk mode switched on elsewhere (presentation, a remount): start at the first viewpoint.
  useEffect(() => {
    if (walk && !walkStart) setWalkStart(firstPose());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk, walkStart]);
  const startWalk = () => {
    setWalkStart(firstPose());
    set({ walk: true });
  };
  const goTo = (pose: Pose) => void walkApi.current?.goTo(pose);
  const savePose = () => {
    const p = walkApi.current?.pose();
    if (p) useEditor.getState().addViewpoint(p);
  };

  // ----- recorded walkthrough video -----
  const [recording, setRecording] = useState<{ done: number; total: number } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const recordVideo = async () => {
    const api = walkApi.current;
    if (!api) return;
    const mime = videoMimeType();
    if (!mime) {
      setVideoError(sq.walk.videoUnsupported);
      return;
    }
    setVideoError(null);
    const stops = [...autos.map((a) => a.pose), ...(viewpoints ?? [])];
    abort.current = new AbortController();
    setRecording({ done: 0, total: stops.length });
    try {
      const blob = await recordTour(
        api,
        stops,
        (done, total) => setRecording({ done, total }),
        abort.current.signal,
      );
      const project = useEditor.getState().project;
      const name = pdfFileName(project)
        .replace(/^[^-]+/, sq.walk.videoPrefix)
        .replace(/\.pdf$/, `.${videoExtension(mime)}`);
      const { download } = await import('../export/exporter');
      const url = URL.createObjectURL(blob);
      download(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      setVideoError(sq.walk.videoFailed);
    } finally {
      setRecording(null);
      abort.current = null;
    }
  };

  // ----- full-screen client presentation -----
  const present = useUi((s) => s.present);
  const enterPresentation = () => {
    if (!walk) startWalk();
    set({ present: true });
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const exitPresentation = () => {
    set({ present: false });
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };
  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitPresentation();
    };
    // Leaving browser full screen (Esc, swipe) also ends the presentation.
    const onFs = () => {
      if (!document.fullscreenElement) useUi.getState().set({ present: false });
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  return (
    <div
      className="viewer3d"
      data-walk={walk || undefined}
      data-recording={recording ? true : undefined}
    >
      <Canvas
        shadows={SHADOW_MODE}
        frameloop="demand"
        // "E lartë" spends its budget on the effects (AO, bloom, SMAA), not on extra pixels:
        // on an Intel Iris Xe with 20 tables it takes ~19 ms per frame at 1×, ~33 ms at 1.25×.
        dpr={quality === 'high' ? 1 : [1, 1.25]}
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
        <HallScene
          project={scene}
          catalog={catalogMap}
          evening={evening}
          catalogVersion={catalogVersion}
        />
        {quality === 'high' && (
          // Soft grounding shadows under tables and decor (rendered once per change).
          <ContactShadows
            position={[hall.width / 2, 0.006, hall.length / 2]}
            scale={[hall.width, hall.length]}
            resolution={1024}
            opacity={evening ? 0.35 : 0.55}
            blur={2.2}
            far={2.5}
            frames={1}
            key={shadowKey}
          />
        )}
        {quality === 'high' && <Effects evening={evening} />}
        {walk && walkStart ? (
          <WalkControls area={area} start={walkStart} apiRef={walkApi} onFade={setFading} />
        ) : (
          <>
            <OrbitControls
              makeDefault
              maxPolarAngle={Math.PI / 2 - 0.03}
              minDistance={0.3}
              maxDistance={size * 3}
              enableDamping={false}
            />
            <CameraRig preset={camera} hall={hall} items={items} nonce={nonce} />
            {edit3d && <Edit3DControls hall={hall} items={items} catalog={catalogMap} />}
            {!readOnly && kind === 'project' && <Drop3D hall={hall} />}
          </>
        )}
      </Canvas>
      {edit3d && !walk && (
        <div className="edit3d-bar" role="toolbar" aria-label={sq.viewer.edit3dTitle}>
          {selectionCount > 0 ? (
            <>
              <span className="small">{sq.viewer.selected(selectionCount)}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={sq.viewer.rotateLeft}
                title={sq.viewer.rotateLeft}
                onClick={() => {
                  const s = useEditor.getState();
                  s.rotateItems(s.selection, -15);
                }}
              >
                <RotateCcw size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={sq.viewer.rotateRight}
                title={sq.viewer.rotateRight}
                onClick={() => {
                  const s = useEditor.getState();
                  s.rotateItems(s.selection, 15);
                }}
              >
                <RotateCw size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={sq.viewer.deselect}
                title={sq.viewer.deselect}
                onClick={() => useEditor.getState().setSelection([])}
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <span className="small">{sq.viewer.edit3dHint}</span>
          )}
        </div>
      )}
      <div className={`walk-fade${fading ? ' on' : ''}`} aria-hidden />

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
          {walk ? (
            <>
              {!present && (
                <button type="button" className="text-btn" onClick={() => set({ walk: false })}>
                  <Orbit size={18} />
                  <span>{sq.walk.exit}</span>
                </button>
              )}
              {!present && kind === 'project' && (
                <button type="button" className="text-btn" onClick={enterPresentation}>
                  <Presentation size={18} />
                  <span>{sq.walk.present}</span>
                </button>
              )}
            </>
          ) : (
            <>
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
              {!readOnly && (
                <button
                  type="button"
                  className="text-btn"
                  aria-pressed={edit3d}
                  title={sq.viewer.edit3dTitle}
                  onClick={() => set({ edit3d: !edit3d })}
                >
                  <Move size={18} />
                  <span>{sq.viewer.edit3d}</span>
                </button>
              )}
              {kind === 'project' && (
                <button type="button" className="text-btn walk-btn" onClick={startWalk}>
                  <Footprints size={18} />
                  <span>{sq.walk.enter}</span>
                </button>
              )}
              {kind === 'project' && (
                <button type="button" className="text-btn" onClick={enterPresentation}>
                  <Presentation size={18} />
                  <span>{sq.walk.present}</span>
                </button>
              )}
            </>
          )}
        </div>
        <div className="control-group">
          <button
            type="button"
            className="text-btn"
            aria-pressed={quality === 'high'}
            title={`${sq.walk.quality}: ${quality === 'high' ? sq.walk.qualityHigh : sq.walk.qualityNormal}`}
            onClick={() => set({ quality: quality === 'high' ? 'normal' : 'high' })}
          >
            <Sparkles size={18} />
            <span>{quality === 'high' ? sq.walk.qualityHigh : sq.walk.qualityNormal}</span>
          </button>
        </div>
      </div>

      {walk && (
        <div className="walk-panel" role="region" aria-label={sq.walk.viewpoints}>
          <p className="walk-hint small">{sq.walk.hint}</p>
          <div className="walk-points">
            {autos.map(({ key, pose }) => (
              <button
                key={key}
                type="button"
                className="chip"
                onClick={() => goTo(pose)}
                aria-label={sq.walk.goTo(sq.walk.auto[key])}
              >
                <Bookmark size={14} />
                <span>{sq.walk.auto[key]}</span>
              </button>
            ))}
            {(viewpoints ?? []).map((v) => (
              <span key={v.id} className={`chip chip-saved${readOnly ? ' readonly' : ''}`}>
                <button type="button" onClick={() => goTo(v)} aria-label={sq.walk.goTo(v.name)}>
                  <Bookmark size={14} />
                  <span>{v.name}</span>
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className="chip-remove"
                    onClick={() => useEditor.getState().removeViewpoint(v.id)}
                    aria-label={sq.walk.remove(v.name)}
                    title={sq.walk.remove(v.name)}
                  >
                    <X size={14} />
                  </button>
                )}
              </span>
            ))}
            {!readOnly && (
              <button type="button" className="chip chip-add" onClick={savePose}>
                <BookmarkPlus size={14} />
                <span>{sq.walk.save}</span>
              </button>
            )}
            {recording ? (
              <button
                type="button"
                className="chip chip-recording"
                onClick={() => abort.current?.abort()}
              >
                <Square size={14} />
                <span>
                  {sq.walk.recording(recording.done, recording.total)} · {sq.walk.stopRecording}
                </span>
              </button>
            ) : (
              <button type="button" className="chip" onClick={() => void recordVideo()}>
                <Circle size={14} className="rec-dot" />
                <span>{sq.walk.record}</span>
              </button>
            )}
          </div>
          {videoError && (
            <p className="form-error small" role="alert">
              {videoError}
            </p>
          )}
        </div>
      )}
      {present && (
        <button
          type="button"
          className="icon-btn present-exit"
          onClick={exitPresentation}
          aria-label={sq.walk.exitPresent}
          title={sq.walk.exitPresent}
        >
          <X size={22} />
        </button>
      )}
    </div>
  );
}
