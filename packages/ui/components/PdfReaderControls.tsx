import React, { useEffect, useRef, useState } from 'react';
import type { PdfLoader } from 'react-pdf-highlighter';
import type { PdfOutlineEntry, PdfSearchResult } from '../utils/pdfReader';

type PdfDocumentProxy = Parameters<React.ComponentProps<typeof PdfLoader>['children']>[0];

export type PdfNavigationMode = 'outline' | 'thumbnails' | null;

interface PdfReaderToolbarProps {
  pageNumber: number;
  pageCount: number;
  scalePercent: number;
  searchQuery: string;
  searchBusy: boolean;
  searchResults: readonly PdfSearchResult[];
  searchIndex: number;
  navigationMode: PdfNavigationMode;
  onPageChange: (pageNumber: number) => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitWidth: () => void;
  onResetZoom: () => void;
  onSearchQueryChange: (query: string) => void;
  onPreviousSearchResult: () => void;
  onNextSearchResult: () => void;
  onNavigationModeChange: (mode: PdfNavigationMode) => void;
}

const controlClass = 'pn-pdf-reader-button';

export function PdfReaderToolbar({
  pageNumber,
  pageCount,
  scalePercent,
  searchQuery,
  searchBusy,
  searchResults,
  searchIndex,
  navigationMode,
  onPageChange,
  onZoomOut,
  onZoomIn,
  onFitWidth,
  onResetZoom,
  onSearchQueryChange,
  onPreviousSearchResult,
  onNextSearchResult,
  onNavigationModeChange,
}: PdfReaderToolbarProps) {
  const [pageInput, setPageInput] = useState(String(pageNumber));
  useEffect(() => setPageInput(String(pageNumber)), [pageNumber]);

  const commitPage = () => {
    const next = Number(pageInput);
    if (Number.isInteger(next) && next >= 1 && next <= pageCount) onPageChange(next);
    else setPageInput(String(pageNumber));
  };

  const resultLabel = searchBusy
    ? 'Searching…'
    : searchQuery.trim()
      ? searchResults.length > 0
        ? `${searchIndex + 1}/${searchResults.length}`
        : '0 results'
      : '';
  const currentResult = searchResults[searchIndex];

  return (
    <div className="pn-pdf-reader-toolbar" data-pdf-reader-toolbar>
      <div className="pn-pdf-reader-group" aria-label="Page navigation">
        <button className={controlClass} onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1} title="Previous page">‹</button>
        <input
          className="pn-pdf-page-input"
          aria-label="Current PDF page"
          inputMode="numeric"
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value)}
          onBlur={commitPage}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); commitPage(); }
          }}
        />
        <span className="pn-pdf-reader-muted">/ {pageCount}</span>
        <button className={controlClass} onClick={() => onPageChange(pageNumber + 1)} disabled={pageNumber >= pageCount} title="Next page">›</button>
      </div>

      <div className="pn-pdf-reader-group" aria-label="Zoom controls">
        <button className={controlClass} onClick={onZoomOut} title="Zoom out">−</button>
        <button className="pn-pdf-zoom-value" onClick={onResetZoom} title="Reset zoom">{scalePercent}%</button>
        <button className={controlClass} onClick={onZoomIn} title="Zoom in">+</button>
        <button className={controlClass} onClick={onFitWidth} title="Fit page width">Fit</button>
      </div>

      <div className="pn-pdf-search-group" title={currentResult?.snippet}>
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          aria-label="Search PDF"
          placeholder="Search PDF"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />
        {resultLabel ? <span className="pn-pdf-search-count">{resultLabel}</span> : null}
        <button className={controlClass} disabled={searchResults.length === 0} onClick={onPreviousSearchResult} title="Previous search result">↑</button>
        <button className={controlClass} disabled={searchResults.length === 0} onClick={onNextSearchResult} title="Next search result">↓</button>
      </div>

      <div className="pn-pdf-reader-group pn-pdf-reader-nav-buttons" aria-label="Document navigation">
        <button
          className={`${controlClass}${navigationMode === 'outline' ? ' is-active' : ''}`}
          onClick={() => onNavigationModeChange(navigationMode === 'outline' ? null : 'outline')}
          title="Document outline"
        >
          Outline
        </button>
        <button
          className={`${controlClass}${navigationMode === 'thumbnails' ? ' is-active' : ''}`}
          onClick={() => onNavigationModeChange(navigationMode === 'thumbnails' ? null : 'thumbnails')}
          title="Page thumbnails"
        >
          Pages
        </button>
      </div>
    </div>
  );
}

function PdfThumbnail({
  document,
  pageNumber,
  selected,
  active,
  onSelect,
}: {
  document: PdfDocumentProxy;
  pageNumber: number;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (active) setVisible(true);
  }, [active]);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void document.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 0.22 });
      const canvas = canvasRef.current;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      return renderTask.promise;
    }).catch(() => {});
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* already complete */ }
    };
  }, [document, pageNumber, visible]);

  return (
    <button
      className={`pn-pdf-thumbnail${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-label={`Go to PDF page ${pageNumber}`}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <span>{pageNumber}</span>
    </button>
  );
}

export function PdfReaderNavigationPanel({
  mode,
  document,
  outline,
  outlineBusy,
  pageNumber,
  onPageChange,
}: {
  mode: Exclude<PdfNavigationMode, null>;
  document: PdfDocumentProxy;
  outline: readonly PdfOutlineEntry[];
  outlineBusy: boolean;
  pageNumber: number;
  onPageChange: (pageNumber: number) => void;
}) {
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);
  const [thumbnailWindow, setThumbnailWindow] = useState(() => ({
    start: Math.max(0, pageNumber - 6),
    end: Math.min(document.numPages - 1, pageNumber + 6),
  }));

  useEffect(() => {
    if (mode !== 'thumbnails') return;
    setThumbnailWindow((current) => {
      const index = pageNumber - 1;
      if (index >= current.start && index <= current.end) return current;
      return {
        start: Math.max(0, index - 5),
        end: Math.min(document.numPages - 1, index + 5),
      };
    });
  }, [document.numPages, mode, pageNumber]);

  const updateThumbnailWindow = () => {
    const scroller = thumbnailScrollRef.current;
    if (!scroller) return;
    const estimatedRowHeight = 144;
    const first = Math.floor(scroller.scrollTop / estimatedRowHeight);
    const visibleRows = Math.ceil(scroller.clientHeight / estimatedRowHeight);
    setThumbnailWindow({
      start: Math.max(0, first - 3),
      end: Math.min(document.numPages - 1, first + visibleRows + 3),
    });
  };

  return (
    <aside className="pn-pdf-reader-navigation" aria-label={mode === 'outline' ? 'PDF outline' : 'PDF pages'}>
      <div className="pn-pdf-reader-navigation-title">{mode === 'outline' ? 'Outline' : 'Pages'}</div>
      <div
        ref={thumbnailScrollRef}
        className="pn-pdf-reader-navigation-scroll"
        onScroll={mode === 'thumbnails' ? updateThumbnailWindow : undefined}
      >
        {mode === 'outline' ? (
          outlineBusy ? <p className="pn-pdf-reader-empty">Loading outline…</p>
          : outline.length === 0 ? <p className="pn-pdf-reader-empty">No document outline.</p>
          : outline.map((entry, index) => (
            <button
              key={`${entry.depth}:${entry.title}:${index}`}
              className="pn-pdf-outline-entry"
              style={{ paddingLeft: `${0.65 + Math.min(entry.depth, 6) * 0.75}rem` }}
              disabled={!entry.pageNumber}
              onClick={() => { if (entry.pageNumber) onPageChange(entry.pageNumber); }}
              title={entry.pageNumber ? `Page ${entry.pageNumber}` : undefined}
            >
              <span>{entry.title}</span>
              {entry.pageNumber ? <small>{entry.pageNumber}</small> : null}
            </button>
          ))
        ) : Array.from({ length: document.numPages }, (_, index) => (
          <PdfThumbnail
            key={index + 1}
            document={document}
            pageNumber={index + 1}
            selected={pageNumber === index + 1}
            active={index >= thumbnailWindow.start && index <= thumbnailWindow.end}
            onSelect={() => onPageChange(index + 1)}
          />
        ))}
      </div>
    </aside>
  );
}
