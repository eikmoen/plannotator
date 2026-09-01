import { useEffect, useState } from 'react';
import {
  addScrollViewportListener,
  getScrollViewportRect,
  getScrollViewportTop,
  isDocumentScrollViewport,
} from './useScrollViewport';

/** Return normalized reading progress for an element or document scroll viewport. */
export function calculateReadingProgress(viewport: HTMLElement): number {
  const viewportHeight = isDocumentScrollViewport(viewport)
    ? getScrollViewportRect(viewport).height
    : viewport.clientHeight;
  const scrollHeight = viewport.scrollHeight;
  if (viewportHeight <= 0 || scrollHeight <= 0) return 0;

  const scrollableDistance = scrollHeight - viewportHeight;
  if (scrollableDistance <= 0) return 1;

  return Math.max(0, Math.min(1, getScrollViewportTop(viewport) / scrollableDistance));
}

/**
 * Track an active reader viewport without routing every scroll event through
 * its parent app. Resize observation keeps the result accurate while Markdown
 * media or lazily rendered PDF pages change the document height.
 */
export function useReadingProgress(
  viewport: HTMLElement | null,
  resetKey?: string | number,
): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!viewport) {
      setProgress(0);
      return;
    }

    const targetWindow = viewport.ownerDocument.defaultView;
    let frame: number | null = null;
    let disposed = false;

    const commit = () => {
      frame = null;
      if (disposed) return;
      const next = calculateReadingProgress(viewport);
      setProgress((current) => Math.abs(current - next) < 0.0005 ? current : next);
    };
    const schedule = () => {
      if (frame !== null) return;
      if (targetWindow?.requestAnimationFrame) {
        frame = targetWindow.requestAnimationFrame(commit);
      } else {
        commit();
      }
    };

    const removeScrollListener = addScrollViewportListener(viewport, schedule);
    targetWindow?.addEventListener('resize', schedule, { passive: true });

    const ResizeObserverConstructor = targetWindow?.ResizeObserver ?? globalThis.ResizeObserver;
    const resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(schedule)
      : null;
    const observeViewportChildren = () => {
      if (!resizeObserver) return;
      resizeObserver.observe(viewport);
      for (const child of viewport.children) resizeObserver.observe(child);
    };
    observeViewportChildren();

    const MutationObserverConstructor = targetWindow?.MutationObserver ?? globalThis.MutationObserver;
    const mutationObserver = MutationObserverConstructor
      ? new MutationObserverConstructor(() => {
          observeViewportChildren();
          schedule();
        })
      : null;
    mutationObserver?.observe(viewport, { childList: true });

    schedule();
    return () => {
      disposed = true;
      removeScrollListener();
      targetWindow?.removeEventListener('resize', schedule);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (frame !== null) targetWindow?.cancelAnimationFrame?.(frame);
    };
  }, [resetKey, viewport]);

  return progress;
}
