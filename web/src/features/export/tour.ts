import type { Pose } from '../viewer3d/cameras';
import type { WalkApi } from '../viewer3d/WalkControls';

/** Video formats in order of preference: MP4 plays everywhere (WhatsApp, iPhone), WebM elsewhere. */
const MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function videoMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export const videoExtension = (mime: string) => (mime.startsWith('video/mp4') ? 'mp4' : 'webm');

export const VIDEO_SIZE = { width: 1280, height: 720 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Record a walkthrough video of the live 3D view: glide to every stop, look around a little
 * (left, then right), and move on. Returns the video file.
 */
export async function recordTour(
  api: WalkApi,
  stops: readonly Pose[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const mime = videoMimeType();
  if (!mime) throw new Error('MediaRecorder not supported');
  const stream = api.canvas().captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  api.setContinuous(true);
  // Always a landscape HD video, whatever the size of the window.
  api.setVideoSize(VIDEO_SIZE);
  try {
    // Start at the first stop before recording, so the video doesn't open mid-glide.
    if (stops[0]) await api.goTo(stops[0], { duration: 10 });
    recorder.start(500);
    for (let i = 0; i < stops.length; i++) {
      if (signal?.aborted) break;
      onProgress?.(i, stops.length);
      await api.goTo(stops[i]!, { duration: i === 0 ? 400 : 2600 });
      await sleep(500);
      const here = api.pose();
      await api.goTo({ ...here, yaw: here.yaw - 30 }, { duration: 1600 });
      await api.goTo({ ...here, yaw: here.yaw + 30 }, { duration: 2800 });
      await sleep(400);
    }
    onProgress?.(stops.length, stops.length);
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    api.setVideoSize(null);
    api.setContinuous(false);
  }
  return new Blob(chunks, { type: mime.split(';')[0] });
}
