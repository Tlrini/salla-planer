import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

/** Mirrors ScanClaim / ScanStage in shared/src/scans.ts (the worker is built on its own). */
export interface Claim {
  id: string;
  lease: string;
  source: 'video' | 'photos';
  /** A decoration or a whole hall; both go through the same photogrammetry. */
  purpose?: 'decor' | 'hall';
  files: string[];
}

export type Stage = 'download' | 'frames' | 'reconstruct' | 'optimize' | 'upload';

/** The job was deleted or given to another worker: stop working on it. */
export class LeaseLost extends Error {
  constructor() {
    super('lease lost');
  }
}

/** Client for the app's /api/worker/ routes (bearer token, see server/src/routes/scans.ts). */
export class WorkerApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/api/worker/${path}`;
  }

  private headers(lease?: string): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      ...(lease ? { 'x-scan-lease': lease } : {}),
    };
  }

  private async check(res: Response, what: string): Promise<void> {
    if (res.ok) return;
    if (res.status === 409) throw new LeaseLost();
    const text = await res.text().catch(() => '');
    throw new Error(`${what}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  /** The next job, or null when nothing waits. */
  async claim(): Promise<Claim | null> {
    const res = await fetch(this.url('claim'), { method: 'POST', headers: this.headers() });
    if (res.status === 204) return null;
    await this.check(res, 'claim');
    return (await res.json()) as Claim;
  }

  async download(job: Claim, name: string, target: string): Promise<void> {
    const res = await fetch(this.url(`jobs/${job.id}/files/${encodeURIComponent(name)}`), {
      headers: this.headers(job.lease),
    });
    await this.check(res, `download ${name}`);
    if (!res.body) throw new Error(`download ${name}: empty body`);
    await pipeline(
      Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
      fs.createWriteStream(target),
    );
  }

  async progress(job: Claim, progress: number, stage: Stage): Promise<void> {
    const res = await fetch(this.url(`jobs/${job.id}/progress`), {
      method: 'POST',
      headers: { ...this.headers(job.lease), 'content-type': 'application/json' },
      body: JSON.stringify({ progress, stage }),
    });
    await this.check(res, 'progress');
  }

  async result(job: Claim, glbPath: string): Promise<void> {
    const form = new FormData();
    form.append('file', await fs.openAsBlob(glbPath, { type: 'model/gltf-binary' }), 'scan.glb');
    const res = await fetch(this.url(`jobs/${job.id}/result`), {
      method: 'POST',
      headers: this.headers(job.lease),
      body: form,
    });
    await this.check(res, 'result');
  }

  async fail(job: Claim, error: string): Promise<void> {
    const res = await fetch(this.url(`jobs/${job.id}/fail`), {
      method: 'POST',
      headers: { ...this.headers(job.lease), 'content-type': 'application/json' },
      body: JSON.stringify({ error }),
    });
    await this.check(res, 'fail');
  }
}
