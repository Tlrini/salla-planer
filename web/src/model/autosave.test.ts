import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@salla/shared';
import { flushSave, hasUnsavedChanges, resetAutosave } from './autosave';
import { newProject, useEditor } from './store';
import { useUi } from './ui';

interface Call {
  url: string;
  body: { version?: number; name?: string } | null;
  keepalive: boolean;
  respond: (status: number, body: unknown) => void;
  fail: () => void;
}

let calls: Call[] = [];

/** fetch stub: every request waits until the test answers it. */
function stubFetch() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          calls.push({
            url,
            body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
            keepalive: init.keepalive === true,
            respond: (status, body) => resolve(new Response(JSON.stringify(body), { status })),
            fail: () => reject(new TypeError('network')),
          });
        }),
    ),
  );
}

function open(name = 'A'): Project {
  const p = { ...newProject(), name, version: 4 };
  useEditor.getState().openProject(p);
  resetAutosave(useEditor.getState().project);
  return p;
}

const edit = (name: string) => useEditor.getState().updateProject({ name });
const status = () => useUi.getState().save.kind;
/** Let pending promise callbacks run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('autosave', () => {
  beforeEach(() => stubFetch());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not save a project that was only opened and viewed', async () => {
    open();
    expect(hasUnsavedChanges()).toBe(false);
    await flushSave();
    expect(calls).toHaveLength(0);
  });

  it('saves edits once, with the current version, as a keepalive request', async () => {
    const p = open();
    edit('B');
    expect(hasUnsavedChanges()).toBe(true);
    const done = flushSave();
    await tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`/api/projects/${p.id}`);
    expect(calls[0]!.body).toMatchObject({ name: 'B', version: 4 });
    expect(calls[0]!.keepalive).toBe(true);
    calls[0]!.respond(200, { ...useEditor.getState().project, version: 5 });
    await done;
    expect(useEditor.getState().meta?.version).toBe(5);
    expect(status()).toBe('saved');
    await flushSave();
    expect(calls).toHaveLength(1);
  });

  it('keeps "saving" and saves again when edits arrive during a request', async () => {
    open();
    edit('B');
    const first = flushSave();
    await tick();
    edit('C');
    const second = flushSave(); // e.g. the user presses "Ruaj" meanwhile
    calls[0]!.respond(200, { version: 5 });
    await tick();
    expect(status()).toBe('saving');
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).toMatchObject({ name: 'C', version: 5 });
    calls[1]!.respond(200, { version: 6 });
    await Promise.all([first, second]);
    expect(status()).toBe('saved');
  });

  it('never applies a late response to a project opened in the meantime', async () => {
    open('A');
    edit('A2');
    const done = flushSave();
    await tick();
    const other = open('Other');
    calls[0]!.respond(409, { error: 'conflict', updatedBy: 'Arta', version: 9 });
    await done;
    expect(useEditor.getState().meta).toMatchObject({ id: other.id, version: 4 });
    expect(status()).toBe('saved');
  });

  it('stops on a conflict until the user decides', async () => {
    open();
    edit('B');
    const done = flushSave();
    await tick();
    calls[0]!.respond(409, { error: 'conflict', updatedBy: 'Arta', version: 9 });
    await done;
    expect(useUi.getState().save).toEqual({ kind: 'conflict', by: 'Arta' });
    edit('C');
    await flushSave();
    expect(calls).toHaveLength(1);
  });

  it('retries after a network error', async () => {
    vi.useFakeTimers();
    open();
    edit('B');
    const done = flushSave();
    await vi.advanceTimersByTimeAsync(0);
    calls[0]!.fail();
    await done;
    expect(status()).toBe('error');
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(2);
    calls[1]!.respond(200, { version: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(status()).toBe('saved');
  });
});
