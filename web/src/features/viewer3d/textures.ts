import * as THREE from 'three';
import type { FloorType } from '@salla/shared';

/** Deterministic PRNG so procedural textures look the same on every render. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  return [cv, cv.getContext('2d')!];
}

function finish(cv: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

const floorCache = new Map<string, FloorMaps>();

/** Size in meters that one floor texture tile covers. */
export const FLOOR_TILE_METERS: Record<FloorType, number> = {
  parket: 4,
  mermer: 6,
  pllake: 4,
  tapet: 3,
};

/** The three maps of a floor: colour, relief (bump) and roughness. Same layout in all three. */
export interface FloorMaps {
  map: THREE.Texture;
  bump: THREE.Texture;
  rough: THREE.Texture;
}

/** Grey for data maps (bump, roughness): 0 = black, 1 = white. */
function gray(v: number): string {
  const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${c},${c},${c})`;
}

/** Bump and roughness maps hold data, not colours. */
function finishData(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = finish(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function floorTextures(type: FloorType, color: string): FloorMaps {
  const key = `floor|${type}|${color}`;
  const hit = floorCache.get(key);
  if (hit) return hit;
  const S = 1024;
  const [cv, g] = canvas(S);
  // Relief: white = surface, black = grooves (plank seams, grout, slab joints).
  const [hcv, hg] = canvas(S);
  // Roughness (green channel is read): polished parts dark, matte parts light.
  const [rcv, rg] = canvas(S);
  const r = rng(42);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  hg.fillStyle = gray(1);
  hg.fillRect(0, 0, S, S);
  if (type === 'parket') {
    // planks 4 m tile: 20 rows of 0.2 m, staggered lengths
    const rows = 20;
    const h = S / rows;
    for (let row = 0; row < rows; row++) {
      let x = -r() * S * 0.5;
      while (x < S) {
        const len = S * (0.25 + r() * 0.3);
        g.fillStyle = shade(color, (r() - 0.5) * 0.12);
        g.fillRect(x, row * h, len, h);
        // each plank has its own wear of the varnish
        rg.fillStyle = gray(0.4 + r() * 0.2);
        rg.fillRect(x, row * h, len, h);
        // grain
        g.strokeStyle = shade(color, -0.08);
        g.globalAlpha = 0.25;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          const yy = row * h + r() * h;
          g.moveTo(x, yy);
          g.bezierCurveTo(
            x + len * 0.3,
            yy + (r() - 0.5) * 6,
            x + len * 0.6,
            yy + (r() - 0.5) * 6,
            x + len,
            yy,
          );
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = shade(color, -0.22);
        g.fillRect(x, row * h, 2, h);
        hg.fillStyle = gray(0);
        hg.fillRect(x, row * h, 2.5, h);
        rg.fillStyle = gray(0.85);
        rg.fillRect(x, row * h, 2, h);
        x += len;
      }
      g.fillStyle = shade(color, -0.25);
      g.fillRect(0, row * h, S, 1.5);
      hg.fillStyle = gray(0);
      hg.fillRect(0, row * h, S, 2);
    }
  } else if (type === 'mermer') {
    rg.fillStyle = gray(0.1);
    rg.fillRect(0, 0, S, S);
    const grd = g.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, shade(color, 0.03));
    grd.addColorStop(1, shade(color, -0.03));
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    for (let v = 0; v < 26; v++) {
      g.strokeStyle = shade(color, -0.18 - r() * 0.15);
      g.globalAlpha = 0.18 + r() * 0.3;
      g.lineWidth = 0.6 + r() * 2.2;
      const vein = new Path2D();
      let x = r() * S;
      let y = r() * S;
      vein.moveTo(x, y);
      for (let s = 0; s < 8; s++) {
        const nx = x + (r() - 0.3) * 220;
        const ny = y + (r() - 0.5) * 220;
        vein.quadraticCurveTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 120, nx, ny);
        x = nx;
        y = ny;
      }
      g.stroke(vein);
      // veins are a little less polished than the stone
      rg.strokeStyle = gray(0.3);
      rg.lineWidth = g.lineWidth + 1;
      rg.stroke(vein);
    }
    g.globalAlpha = 1;
    // large slabs
    const joints = new Path2D();
    for (let i = 0; i <= 2; i++) {
      joints.moveTo(0, (i * S) / 2);
      joints.lineTo(S, (i * S) / 2);
      joints.moveTo((i * S) / 2, 0);
      joints.lineTo((i * S) / 2, S);
    }
    g.strokeStyle = shade(color, -0.12);
    g.lineWidth = 2;
    g.stroke(joints);
    hg.strokeStyle = gray(0);
    hg.lineWidth = 2.5;
    hg.stroke(joints);
  } else if (type === 'pllake') {
    // 0.5 m tiles on a 4 m tile -> 8 x 8
    const n = 8;
    const t = S / n;
    rg.fillStyle = gray(0.9);
    rg.fillRect(0, 0, S, S);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        g.fillStyle = shade(color, (r() - 0.5) * 0.06);
        g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
        rg.fillStyle = gray(0.2 + r() * 0.08);
        rg.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
      }
    }
    const grout = new Path2D();
    for (let i = 0; i <= n; i++) {
      grout.moveTo(i * t, 0);
      grout.lineTo(i * t, S);
      grout.moveTo(0, i * t);
      grout.lineTo(S, i * t);
    }
    g.strokeStyle = shade(color, -0.2);
    g.lineWidth = 3;
    g.stroke(grout);
    // soft-edged grooves: a wide grey band with a black core
    hg.strokeStyle = gray(0.55);
    hg.lineWidth = 7;
    hg.stroke(grout);
    hg.strokeStyle = gray(0);
    hg.lineWidth = 3;
    hg.stroke(grout);
  } else {
    // carpet: dense speckle + subtle pattern; the pile is the relief
    rg.fillStyle = gray(0.97);
    rg.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S);
    const pile = hg.getImageData(0, 0, S, S);
    for (let p = 0; p < img.data.length; p += 4) {
      const d = (r() - 0.5) * 28;
      img.data[p] = Math.max(0, Math.min(255, img.data[p]! + d));
      img.data[p + 1] = Math.max(0, Math.min(255, img.data[p + 1]! + d));
      img.data[p + 2] = Math.max(0, Math.min(255, img.data[p + 2]! + d));
      const hgt = 200 + d * 1.8;
      pile.data[p] = pile.data[p + 1] = pile.data[p + 2] = hgt;
    }
    g.putImageData(img, 0, 0);
    hg.putImageData(pile, 0, 0);
    g.strokeStyle = shade(color, -0.1);
    g.globalAlpha = 0.35;
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.strokeRect(i * 256 + 40, 40, 176, S - 80);
    }
    g.globalAlpha = 1;
  }
  const maps = { map: finish(cv), bump: finishData(hcv), rough: finishData(rcv) };
  floorCache.set(key, maps);
  return maps;
}

/** Dense flower texture for the flower wall (roses in `color`, leaves in `color2`). */
export function flowerWallTexture(color: string, color2: string): THREE.Texture {
  return cached(`flowerwall|${color}|${color2}`, () => {
    const S = 512;
    const [cv, g] = canvas(S);
    const r = rng(7);
    g.fillStyle = shade(color2, -0.15);
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = shade(color2, (r() - 0.5) * 0.2);
      g.beginPath();
      g.ellipse(r() * S, r() * S, 10 + r() * 10, 5 + r() * 5, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 360; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 9 + r() * 14;
      const base = shade(color, (r() - 0.5) * 0.18);
      const grd = g.createRadialGradient(x, y, 1, x, y, rad);
      grd.addColorStop(0, shade(base, -0.18));
      grd.addColorStop(0.5, base);
      grd.addColorStop(1, shade(base, 0.08));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = shade(base, -0.22);
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(x, y, rad * 0.5, 0, Math.PI * 1.5);
      g.stroke();
      g.globalAlpha = 1;
    }
    return finish(cv);
  });
}

/** Tiny warm dots on transparent background for the light curtain. */
export function fairyLightsTexture(): THREE.Texture {
  return cached('fairy', () => {
    const S = 256;
    const [cv, g] = canvas(S);
    for (let x = 8; x < S; x += 16) {
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, S);
      g.stroke();
      for (let y = 6; y < S; y += 20) {
        const yy = y + ((x / 16) % 2) * 10;
        const grd = g.createRadialGradient(x, yy, 0, x, yy, 5);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(x - 5, yy - 5, 10, 10);
      }
    }
    return finish(cv);
  });
}

/** Soft round glow, bright in the middle and fading to nothing at the edge. */
export function glowTexture(): THREE.Texture {
  return cached('glow', () => {
    const S = 128;
    const [cv, g] = canvas(S);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return finish(cv, false);
  });
}

/** Vertical light wash: bright at the bottom, fading up and to the sides. */
export function washTexture(): THREE.Texture {
  return cached('wash', () => {
    const S = 256;
    const [cv, g] = canvas(S);
    const grd = g.createRadialGradient(S / 2, S, 0, S / 2, S, S);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return finish(cv, false);
  });
}

/**
 * Soft vertical folds for tablecloth skirts (bump map, repeats around the table). Irregular
 * spacing and depth so it doesn't look like corrugated sheet.
 */
export function pleatTexture(): THREE.Texture {
  return cached('pleats', () => {
    const W = 512;
    const H = 8;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d')!;
    const r = rng(11);
    const folds = 16;
    const phase = Array.from({ length: folds }, () => 0.7 + r() * 0.6);
    for (let x = 0; x < W; x++) {
      const f = (x / W) * folds;
      const k = Math.floor(f);
      const v = 0.5 + 0.5 * Math.sin((f - k) * Math.PI * 2) * phase[k]!;
      ctx.fillStyle = gray(0.15 + v * 0.7);
      ctx.fillRect(x, 0, 1, H);
    }
    return finishData(cv);
  });
}
