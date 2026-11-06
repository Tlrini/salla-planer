import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const IMAGES_URL = '/uploads/images/';

/** File type by content (never by name): png, jpg or webp; null for anything else. */
export function imageType(buf: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  return null;
}

/** Image uploads (floor-plan photos under the blueprint). Any logged-in user. */
export function registerImageRoutes(app: FastifyInstance, dataDir: string): void {
  const dir = path.join(dataDir, 'uploads', 'images');
  app.post('/api/images', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
    if (!file) return reply.code(400).send({ error: 'no_file' });
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: 'too_large' });
    }
    if (file.file.truncated) return reply.code(413).send({ error: 'too_large' });
    const type = imageType(buf);
    if (!type) return reply.code(400).send({ error: 'not_image' });
    fs.mkdirSync(dir, { recursive: true });
    const name = `${nanoid(12)}.${type}`;
    fs.writeFileSync(path.join(dir, name), buf);
    return reply.code(201).send({ url: `${IMAGES_URL}${name}` });
  });
}
