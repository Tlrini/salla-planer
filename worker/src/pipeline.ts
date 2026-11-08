import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO, type Document } from '@gltf-transform/core';
import { dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import {
  framesPerSecond,
  isTextureFile,
  jpegName,
  MAX_FRAMES,
  pickEvenly,
  pickMeshOutput,
  rewriteMtl,
  simplifyRatio,
} from './plan.js';

/** Max side of a texture in the final model (AGENTS.md §16: textures ≤ 2048 px). */
const MAX_TEXTURE_PX = 2048;

/** Run a program; resolves with its stdout, rejects with the end of its output on failure. */
export function run(
  cmd: string,
  args: readonly string[],
  opts: { cwd?: string; signal?: AbortSignal; onLine?: (line: string) => void } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, signal: opts.signal });
    let out = '';
    let tail = '';
    const take = (chunk: Buffer, keep: boolean) => {
      const text = chunk.toString();
      if (keep) out += text;
      tail = (tail + text).slice(-2000);
      if (opts.onLine) for (const line of text.split(/\r?\n/)) if (line.trim()) opts.onLine(line);
    };
    child.stdout.on('data', (c: Buffer) => take(c, true));
    child.stderr.on('data', (c: Buffer) => take(c, false));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(cmd)} exited with ${code}: ${tail.trim()}`));
    });
  });
}

/** Video length in seconds, or null when the container does not say (browser WebM). */
async function videoDuration(file: string): Promise<number | null> {
  try {
    const out = await run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      file,
    ]);
    const s = Number(out.trim());
    return Number.isFinite(s) && s > 0 ? s : null;
  } catch {
    return null;
  }
}

/** Frames of a video as JPEGs in `outDir` (at most MAX_FRAMES, spread over the whole video). */
export async function extractFrames(video: string, outDir: string): Promise<number> {
  fs.mkdirSync(outDir, { recursive: true });
  const fps = framesPerSecond(await videoDuration(video));
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    video,
    '-vf',
    `fps=${fps},scale='min(1920,iw)':-2`,
    '-q:v',
    '2',
    path.join(outDir, 'frame_%05d.jpg'),
  ]);
  const frames = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith('.jpg'))
    .sort();
  const keep = new Set(pickEvenly(frames, MAX_FRAMES));
  for (const f of frames) if (!keep.has(f)) fs.rmSync(path.join(outDir, f));
  return keep.size;
}

export interface MeshroomOptions {
  bin: string;
  pipeline: string;
  /** Extra `--paramOverrides` items, e.g. "Texturing:textureSide=2048". */
  params: string[];
  signal: AbortSignal;
  onLine?: (line: string) => void;
}

/** Photogrammetry: images in `imagesDir` -> textured mesh files in `outDir`. */
export async function reconstruct(
  imagesDir: string,
  outDir: string,
  opts: MeshroomOptions,
): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  const args = ['--input', imagesDir, '--pipeline', opts.pipeline, '--output', outDir];
  if (opts.params.length) args.push('--paramOverrides', ...opts.params);
  await run(opts.bin, args, {
    signal: opts.signal,
    ...(opts.onLine ? { onLine: opts.onLine } : {}),
  });
}

/**
 * Turn every texture into a JPEG of at most MAX_TEXTURE_PX (glTF cannot use EXR, and large
 * textures are slow on tablets) and point the .mtl files at the new names.
 */
async function prepareTextures(dir: string): Promise<void> {
  const renames: Record<string, string> = {};
  for (const name of fs.readdirSync(dir)) {
    if (!isTextureFile(name)) continue;
    const target = jpegName(name);
    const tmp = path.join(dir, `tmp-${target}`);
    const exr = name.toLowerCase().endsWith('.exr');
    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      // EXR textures are linear light; convert them to sRGB like any photo.
      ...(exr ? ['-apply_trc', 'iec61966_2_1'] : []),
      '-i',
      path.join(dir, name),
      '-vf',
      `scale='min(${MAX_TEXTURE_PX},iw)':'min(${MAX_TEXTURE_PX},ih)':force_original_aspect_ratio=decrease`,
      '-q:v',
      '3',
      tmp,
    ]);
    if (name !== target) fs.rmSync(path.join(dir, name));
    fs.renameSync(tmp, path.join(dir, target));
    if (name !== target) renames[name] = target;
  }
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.mtl')) continue;
    const file = path.join(dir, name);
    fs.writeFileSync(file, rewriteMtl(fs.readFileSync(file, 'utf8'), renames));
  }
}

function countTriangles(doc: Document): number {
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      triangles += (indices ? indices.getCount() : (position?.getCount() ?? 0)) / 3;
    }
  return Math.round(triangles);
}

/**
 * The photogrammetry output as one optimized .glb at `target`: OBJ is converted with assimp,
 * then gltf-transform welds, simplifies to about `maxTriangles`, removes duplicates and unused
 * data, and embeds the textures.
 */
export async function buildGlb(outDir: string, target: string, maxTriangles: number) {
  await prepareTextures(outDir);
  const found = pickMeshOutput(fs.readdirSync(outDir));
  if (!found) throw new Error('photogrammetry produced no mesh');
  let source = path.join(outDir, found.file);
  if (found.kind === 'obj') {
    const gltf = path.join(outDir, 'converted.gltf');
    await run('assimp', ['export', source, gltf, '-fgltf2']);
    source = gltf;
  }

  await MeshoptSimplifier.ready;
  const io = new NodeIO();
  const doc = await io.read(source);
  await doc.transform(weld(), dedup());
  const ratio = simplifyRatio(countTriangles(doc), maxTriangles);
  if (ratio < 1)
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }));
  await doc.transform(prune());
  await io.write(target, doc);
  return { triangles: countTriangles(doc) };
}
