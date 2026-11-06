import { useEffect, useState } from 'react';

/** Loaded images shared by the plan, the catalog and exports (one request per URL). */
const cache = new Map<string, Promise<HTMLImageElement>>();
const loaded = new Map<string, HTMLImageElement>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        loaded.set(url, img);
        resolve(img);
      };
      img.onerror = () => {
        cache.delete(url);
        reject(new Error(`image failed: ${url}`));
      };
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

/** Wait until all images are loaded (failures are ignored), e.g. before a plan snapshot. */
export async function preloadImages(urls: Iterable<string | undefined>): Promise<void> {
  const unique = [...new Set([...urls].filter((u): u is string => !!u))];
  await Promise.all(unique.map((u) => loadImage(u).catch(() => undefined)));
}

/** The image for `url` once loaded (immediately if already cached), else undefined. */
export function useLoadedImage(url: string | undefined): HTMLImageElement | undefined {
  const [img, setImg] = useState(() => (url ? loaded.get(url) : undefined));
  useEffect(() => {
    if (!url) {
      setImg(undefined);
      return;
    }
    const ready = loaded.get(url);
    if (ready) {
      setImg(ready);
      return;
    }
    let alive = true;
    loadImage(url)
      .then((i) => alive && setImg(i))
      .catch(() => alive && setImg(undefined));
    return () => {
      alive = false;
    };
  }, [url]);
  return img;
}
