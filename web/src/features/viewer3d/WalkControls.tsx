import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  isPathClear,
  isWalkable,
  walkStep,
  walkTarget,
  yawWrap,
  type WalkArea,
} from '@salla/shared';
import {
  EYE_HEIGHT,
  poseEuler,
  poseLookingAt,
  walkState,
  yawDirection,
  type Pose,
} from './cameras';

export interface WalkApi {
  /** Current eye position and look direction. */
  pose: () => Pose;
  /**
   * Glide (or, if furniture is in the way, jump) to a pose. Resolves when the move is done.
   * `duration` (ms) overrides the automatic glide speed (used by the recorded tour).
   */
  goTo: (pose: Pose, opts?: { duration?: number }) => Promise<void>;
  /** Render every frame (true) while recording a video, or only on change (false). */
  setContinuous: (on: boolean) => void;
  /** The WebGL canvas (for recording). */
  canvas: () => HTMLCanvasElement;
  /** Render at a fixed video size (e.g. 1280×720) while recording; null restores the view. */
  setVideoSize: (size: { width: number; height: number } | null) => void;
}

const LOOK_DEG_PER_PX = 0.22;
const MAX_PITCH = 65;
const WALK_SPEED = 1.6; // m/s
const TURN_SPEED = 90; // deg/s
const TAP_SLOP_PX = 6;
const JUMP_FADE_MS = 170;
const FOV_MIN = 35;
const FOV_MAX = 75;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** Shortest turn from a to b in degrees. */
const turnDelta = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

interface Anim {
  from: Pose;
  to: Pose;
  start: number;
  duration: number;
  done: () => void;
}

/**
 * Street-View-style walking at eye height (1,6 m): drag to look around, tap the floor to walk
 * there (a jump with a short fade when furniture is in the way), wheel/pinch-free zoom with the
 * mouse wheel, and WASD / arrow keys on a keyboard. Never ends up in a wall or a table.
 */
export function WalkControls({
  area,
  start,
  apiRef,
  onFade,
}: {
  area: WalkArea;
  start: Pose;
  apiRef: Ref<WalkApi>;
  onFade: (on: boolean) => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const getState = useThree((s) => s.get);
  const savedSize = useRef<{ width: number; height: number; dpr: number } | null>(null);
  const pose = useRef<Pose>({ ...start });
  const anim = useRef<Anim | null>(null);
  const keys = useRef(new Set<string>());
  const marker = useRef<THREE.Mesh>(null);
  const areaRef = useRef(area);
  areaRef.current = area;

  const markerMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#C9A44C',
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => markerMaterial.dispose(), [markerMaterial]);

  const apply = () => {
    const p = pose.current;
    walkState.last = { x: p.x, y: p.y, yaw: p.yaw, pitch: p.pitch };
    camera.position.set(p.x, EYE_HEIGHT, p.y);
    camera.rotation.set(...poseEuler(p), 'YXZ');
    camera.updateMatrixWorld();
    invalidate();
  };

  /** The free spot for a wanted pose; pushed off furniture, still looking at its subject. */
  const resolve = (target: Pose): Pose | null => {
    const spot = walkTarget(target, areaRef.current);
    if (!spot) return null;
    const moved = Math.hypot(spot.x - target.x, spot.y - target.y) > 0.05;
    const aimed = moved && target.look ? poseLookingAt(spot.x, spot.y, target.look) : target;
    return { x: spot.x, y: spot.y, yaw: aimed.yaw, pitch: aimed.pitch };
  };

  const goTo = (target: Pose, opts: { duration?: number } = {}) =>
    new Promise<void>((done) => {
      const from = { ...pose.current };
      const to = resolve(target);
      if (!to) {
        done();
        return;
      }
      anim.current?.done();
      if (isPathClear(from, to, areaRef.current)) {
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const turn = Math.abs(turnDelta(from.yaw, to.yaw));
        anim.current = {
          from,
          to,
          start: performance.now(),
          duration: opts.duration ?? Math.min(1800, Math.max(350, dist * 420 + turn * 3)),
          done,
        };
        invalidate();
      } else {
        // Furniture in the way: jump like Street View, behind a short fade.
        anim.current = null;
        onFade(true);
        window.setTimeout(() => {
          pose.current = to;
          apply();
          onFade(false);
          done();
        }, JUMP_FADE_MS);
      }
    });

  useImperativeHandle(apiRef, () => {
    const api: WalkApi = {
      pose: () => ({ ...pose.current }),
      goTo,
      setContinuous: (on) => setFrameloop(on ? 'always' : 'demand'),
      canvas: () => gl.domElement,
      setVideoSize: (size) => {
        const st = getState();
        if (size) {
          savedSize.current ??= {
            width: st.size.width,
            height: st.size.height,
            dpr: st.viewport.dpr,
          };
          st.setDpr(1);
          st.setSize(size.width, size.height);
        } else if (savedSize.current) {
          st.setDpr(savedSize.current.dpr);
          st.setSize(savedSize.current.width, savedSize.current.height);
          savedSize.current = null;
        }
        invalidate();
      },
    };
    // Dev-only handle for testing walking from the console.
    if (import.meta.env.DEV) (window as unknown as { __walk: WalkApi }).__walk = api;
    return api;
  });

  // Start pose, wider FOV for a natural eye-level view; restore the FOV when leaving.
  useEffect(() => {
    const fov = camera.fov;
    camera.fov = 60;
    camera.updateProjectionMatrix();
    pose.current = resolve(start) ?? { x: start.x, y: start.y, yaw: start.yaw, pitch: start.pitch };
    apply();
    return () => {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount / new start pose
  }, [start]);

  // Pointer: drag = look around, tap on the floor = walk there, hover = target ring.
  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean } | null =
      null;

    const floorPoint = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(floor, hit) ? { x: hit.x, y: hit.z } : null;
    };

    const down = (e: PointerEvent) => {
      if (drag || e.button > 0) return;
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
      };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > TAP_SLOP_PX) drag.moved = true;
        if (!drag.moved) return;
        anim.current?.done();
        anim.current = null;
        // The view follows the finger, like Street View.
        const p = pose.current;
        p.yaw = yawWrap(p.yaw - dx * LOOK_DEG_PER_PX);
        p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch + dy * LOOK_DEG_PER_PX));
        apply();
        if (marker.current) marker.current.visible = false;
        return;
      }
      const m = marker.current;
      if (!m || e.pointerType === 'touch') return;
      const f = floorPoint(e);
      const a = areaRef.current;
      if (f && f.x > 0 && f.y > 0 && f.x < a.width && f.y < a.length) {
        m.visible = true;
        m.position.set(f.x, 0.012, f.y);
        markerMaterial.opacity = isWalkable(f, a) ? 0.85 : 0.3;
      } else {
        m.visible = false;
      }
      invalidate();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tapped = !drag.moved;
      drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (!tapped) return;
      const f = floorPoint(e);
      if (f) goTo({ ...pose.current, x: f.x, y: f.y });
    };
    const leave = () => {
      if (marker.current) marker.current.visible = false;
      invalidate();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, camera.fov + e.deltaY * 0.03));
      camera.updateProjectionMatrix();
      invalidate();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, { passive: false });
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('wheel', wheel);
      el.style.cursor = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read refs
  }, [gl, camera, invalidate, markerMaterial]);

  // Keyboard: W/S forward/back, A/D sideways, arrows forward/back/turn.
  useEffect(() => {
    const WALK_KEYS = new Set([
      'w',
      'a',
      's',
      'd',
      'arrowup',
      'arrowdown',
      'arrowleft',
      'arrowright',
    ]);
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!WALK_KEYS.has(k) || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      keys.current.add(k);
      anim.current?.done();
      anim.current = null;
      invalidate();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [invalidate]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const a = anim.current;
    if (a) {
      const t = Math.min(1, (performance.now() - a.start) / a.duration);
      const k = ease(t);
      pose.current = {
        x: a.from.x + (a.to.x - a.from.x) * k,
        y: a.from.y + (a.to.y - a.from.y) * k,
        yaw: yawWrap(a.from.yaw + turnDelta(a.from.yaw, a.to.yaw) * k),
        pitch: a.from.pitch + (a.to.pitch - a.from.pitch) * k,
      };
      if (t >= 1) {
        anim.current = null;
        a.done();
      }
      apply();
      return;
    }
    const pressed = keys.current;
    if (!pressed.size) return;
    const p = pose.current;
    if (pressed.has('arrowleft')) p.yaw = yawWrap(p.yaw - TURN_SPEED * dt);
    if (pressed.has('arrowright')) p.yaw = yawWrap(p.yaw + TURN_SPEED * dt);
    const fwd =
      (pressed.has('w') || pressed.has('arrowup') ? 1 : 0) -
      (pressed.has('s') || pressed.has('arrowdown') ? 1 : 0);
    const side = (pressed.has('d') ? 1 : 0) - (pressed.has('a') ? 1 : 0);
    if (fwd || side) {
      const f = yawDirection(p.yaw);
      const r = yawDirection(p.yaw + 90);
      const len = Math.hypot(fwd, side) || 1;
      const step = (WALK_SPEED * dt) / len;
      const next = walkStep(
        p,
        { x: p.x + (f.x * fwd + r.x * side) * step, y: p.y + (f.y * fwd + r.y * side) * step },
        areaRef.current,
      );
      p.x = next.x;
      p.y = next.y;
    }
    apply();
  });

  return (
    <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={5}>
      <ringGeometry args={[0.2, 0.28, 40]} />
      <primitive object={markerMaterial} attach="material" />
    </mesh>
  );
}
