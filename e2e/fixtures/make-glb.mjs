// Generates e2e/fixtures/flower-vase.glb: a small "scanned" flower arrangement used by tests.
// It imitates a phone-scan export on purpose: units are centimeters and the model lies on its
// side (Z-up), so the library setup has to rotate it upright and set the real height.
// Run: node e2e/fixtures/make-glb.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function colored(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

const parts = [];
// Vase: 24 cm tall, 7–10 cm radius (centimeters, like many scan exports).
parts.push(colored(new THREE.CylinderGeometry(7, 10, 24, 24).translate(0, 12, 0), '#d9d4c7'));
// Rim
parts.push(
  colored(new THREE.TorusGeometry(7, 1, 8, 24).rotateX(Math.PI / 2).translate(0, 24, 0), '#c9a44c'),
);
// Flower cluster: spheres in a dome above the vase.
const rand = (() => {
  let s = 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
})();
const petals = ['#e8c4c4', '#f3ebdd', '#ffffff', '#d98a9a'];
for (let i = 0; i < 26; i++) {
  const a = rand() * Math.PI * 2;
  const r = rand() * 14;
  const y = 30 + Math.sqrt(Math.max(0, 196 - r * r)) * 0.8;
  const size = 3.2 + rand() * 2.2;
  parts.push(
    colored(
      new THREE.IcosahedronGeometry(size, 1).translate(Math.cos(a) * r, y, Math.sin(a) * r),
      petals[i % petals.length],
    ),
  );
}
// A few leaves
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  parts.push(
    colored(
      new THREE.SphereGeometry(4, 8, 6)
        .scale(1.6, 0.35, 0.8)
        .rotateY(-a)
        .translate(Math.cos(a) * 12, 28, Math.sin(a) * 12),
      '#7d9a6a',
    ),
  );
}

const merged = mergeGeometries(parts);
merged.computeVertexNormals();
// Lie it on its side: the scan's "up" is +Z instead of +Y.
merged.rotateX(Math.PI / 2);

const pos = merged.attributes.position.array;
const nor = merged.attributes.normal.array;
const col = merged.attributes.color.array;
const count = merged.attributes.position.count;
merged.computeBoundingBox();
const { min, max } = merged.boundingBox;

const views = [pos, nor, col].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
let offset = 0;
const bufferViews = views.map((v) => {
  const view = { buffer: 0, byteOffset: offset, byteLength: v.length, target: 34962 };
  offset += v.length;
  return view;
});
const bin = Buffer.concat(views);

const gltf = {
  asset: { version: '2.0', generator: 'salla-planner test fixture' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'flower_vase_scan' }],
  meshes: [
    {
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, material: 0 }],
    },
  ],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 0.8,
      },
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count,
      type: 'VEC3',
      min: [min.x, min.y, min.z],
      max: [max.x, max.y, max.z],
    },
    { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count, type: 'VEC3' },
  ],
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};

const pad = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20);
const binPadded = pad(bin, 0);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const chunk = (type, data) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(data.length, 0);
  h.write(type, 4, 'ascii');
  return Buffer.concat([h, data]);
};
const out = Buffer.concat([header, chunk('JSON', json), chunk('BIN\0', binPadded)]);
fs.writeFileSync(path.join(here, 'flower-vase.glb'), out);
console.log(`flower-vase.glb: ${out.length} bytes, ${count} vertices, size`, max.clone().sub(min));
