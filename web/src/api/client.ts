import { useSession } from '../model/session';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown> | null,
  ) {
    super(`API ${status}`);
  }
}

interface RequestOptions {
  /**
   * Let the request finish even if the page is closed (autosave). Browsers reject keepalive
   * bodies over 64 KB, so larger bodies are sent as a normal request.
   */
  keepalive?: boolean;
}

const KEEPALIVE_MAX_BYTES = 60_000;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    const json = JSON.stringify(body);
    init.body = json;
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    if (opts.keepalive && new TextEncoder().encode(json).length <= KEEPALIVE_MAX_BYTES)
      init.keepalive = true;
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, null);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (e.g. a proxy error page): keep the status, drop the body.
    if (res.ok) throw new ApiError(res.status, null);
  }
  if (!res.ok) {
    // Session expired or logged out elsewhere: back to the login screen.
    if (res.status === 401 && path !== '/api/auth/login')
      useSession.getState().set({ user: null, status: 'anon' });
    throw new ApiError(res.status, data as Record<string, unknown> | null);
  }
  return data as T;
}

/**
 * POST a form and report upload progress (0–1). fetch() cannot report upload progress, so this
 * uses XMLHttpRequest; errors behave like the other requests (ApiError, 401 → login screen).
 */
function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, null));
    xhr.onabort = () => reject(new ApiError(0, null));
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // Not JSON (e.g. a proxy error page).
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }
      if (xhr.status === 401) useSession.getState().set({ user: null, status: 'anon' });
      reject(new ApiError(xhr.status, data as Record<string, unknown> | null));
    };
    xhr.send(form);
  });
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>('PUT', path, body, opts),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
  uploadWithProgress,
};
