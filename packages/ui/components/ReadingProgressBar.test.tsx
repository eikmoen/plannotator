import { afterEach, describe, expect, test } from 'bun:test';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { calculateReadingProgress } from '../hooks/useReadingProgress';
import { ReadingProgressBar } from './ReadingProgressBar';

const hasDom = typeof document !== 'undefined';
let root: Root | null = null;
let host: HTMLElement | null = null;

function setViewportDimensions(
  viewport: HTMLElement,
  values: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperties(viewport, {
    scrollHeight: { configurable: true, value: values.scrollHeight },
    clientHeight: { configurable: true, value: values.clientHeight },
    scrollTop: { configurable: true, writable: true, value: values.scrollTop },
  });
}

async function settleFrame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 24));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  if (hasDom) document.body.replaceChildren();
});

describe.if(hasDom)('ReadingProgressBar', () => {
  test('reports scroll progress and updates when the reader viewport scrolls', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    function Harness() {
      const [viewport, setViewport] = useState<HTMLElement | null>(null);
      return (
        <>
          <div data-reader-viewport ref={setViewport} />
          <ReadingProgressBar viewport={viewport} />
        </>
      );
    }

    await act(async () => { root?.render(<Harness />); });
    const viewport = document.querySelector<HTMLElement>('[data-reader-viewport]');
    if (!viewport) throw new Error('reader viewport did not render');
    setViewportDimensions(viewport, { scrollHeight: 1_000, clientHeight: 200, scrollTop: 400 });

    viewport.dispatchEvent(new Event('scroll'));
    await settleFrame();

    const progress = document.querySelector<HTMLElement>('[data-reading-progress]');
    expect(progress?.getAttribute('aria-valuenow')).toBe('50');
    expect(progress?.querySelector<HTMLElement>('div')?.style.transform).toBe('scaleX(0.5)');

    viewport.scrollTop = 800;
    viewport.dispatchEvent(new Event('scroll'));
    await settleFrame();
    expect(progress?.getAttribute('aria-valuenow')).toBe('100');
  });

  test('treats a fully visible document as completely read', () => {
    const viewport = document.createElement('div');
    setViewportDimensions(viewport, { scrollHeight: 400, clientHeight: 600, scrollTop: 0 });
    expect(calculateReadingProgress(viewport)).toBe(1);
  });
});
