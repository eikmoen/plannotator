/**
 * Ctrl/Cmd+E edit toggle (DOM_TESTS=1)
 *
 * Regression guarded: the registry can advertise an edit shortcut while App
 * forgets to wire it, or the second press can be swallowed once CodeMirror
 * owns focus. Exercise the observable document → editor → document cycle.
 */

import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  resetStorageBackend,
  setStorageBackend,
  type StorageBackend,
} from '@plannotator/ui/utils/storage';

const hasDom = typeof document !== 'undefined';
const appModule = hasDom ? await import('./App') : null;
const App = appModule?.default as typeof import('./App')['default'];

const originalFetch = globalThis.fetch;
const originalEventSource = globalThis.EventSource;
const originalInnerWidth = hasDom ? Object.getOwnPropertyDescriptor(window, 'innerWidth') : undefined;

const memory = new Map<string, string>();
const memoryBackend: StorageBackend = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
};

class SilentEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  readonly readyState = SilentEventSource.OPEN;
  readonly url: string;
  readonly withCredentials = false;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
  }

  addEventListener(): void {}
  close(): void {}
  dispatchEvent(): boolean { return true; }
  removeEventListener(): void {}
}

function seedAnnouncementsSeen(): void {
  memory.set('plannotator-look-feel-announcement-seen', '2');
  memory.set('plannotator-vim-mode-announcement-seen', '2');
  memory.set('plannotator-plan-ai-announcement-seen', '1');
}

function fetchForAnnotate(): typeof fetch {
  return async (input) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    if (rawUrl.startsWith('https://api.github.com/')) return new Response(null, { status: 404 });
    const url = new URL(rawUrl, 'http://localhost');
    if (url.pathname === '/api/plan') {
      return Response.json({
        plan: '# Notes\n\nEditable body.\n',
        origin: 'pi',
        mode: 'annotate',
        filePath: '/tmp/notes.md',
        sharingEnabled: false,
        serverConfig: {},
      });
    }
    if (url.pathname === '/api/archive/plans') return Response.json({ plans: [] });
    if (url.pathname === '/api/ai/capabilities') return Response.json({ available: false, providers: [] });
    if (url.pathname === '/api/draft') return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({});
  };
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(): Promise<void> {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  setStorageBackend(memoryBackend);
  seedAnnouncementsSeen();
  globalThis.fetch = fetchForAnnotate();
  globalThis.EventSource = SilentEventSource as unknown as typeof EventSource;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root?.render(<App />); });
  for (let attempt = 0; attempt < 10; attempt += 1) await settle();
}

function editButton(label: 'Edit' | 'Done'): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.trim() === label) ?? null;
}

function pressCtrlE(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'e',
    code: 'KeyE',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  globalThis.fetch = originalFetch;
  globalThis.EventSource = originalEventSource;
  if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth);
  if (hasDom) document.body.replaceChildren();
  memory.clear();
  resetStorageBackend();
});

afterAll(() => {
  resetStorageBackend();
});

describe.if(hasDom)('edit mode shortcut', () => {
  test('Ctrl+E enters editing and leaves it while CodeMirror owns focus', async () => {
    await mount();
    expect(editButton('Edit')?.getAttribute('aria-pressed')).toBe('false');

    let event: KeyboardEvent | null = null;
    await act(async () => { event = pressCtrlE(window); });
    await settle();

    expect(event?.defaultPrevented).toBe(true);
    expect(editButton('Done')?.getAttribute('aria-pressed')).toBe('true');
    const editor = document.querySelector<HTMLElement>('.cm-editor');
    expect(editor).not.toBeNull();

    await act(async () => { event = pressCtrlE(editor!); });
    await settle();

    expect(event?.defaultPrevented).toBe(true);
    expect(editButton('Edit')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.cm-editor')).toBeNull();
  });
});
