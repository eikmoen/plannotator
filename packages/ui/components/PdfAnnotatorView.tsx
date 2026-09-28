import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaHighlight,
  Highlight,
  PdfHighlighter,
  PdfLoader,
  Popup,
} from "react-pdf-highlighter";
import type { IHighlight, NewHighlight } from "react-pdf-highlighter";
import "react-pdf-highlighter/dist/style.css";
import {
  isPdfAnnotationColor,
  type PdfAnnotation,
  type PdfAnnotationColor,
  type PdfAnnotationDocument,
  type PdfPageMapping,
} from "@plannotator/core/pdf-annotations";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { CommentPopover } from "./CommentPopover";
import { ReadingProgressBar } from "./ReadingProgressBar";
import { getIdentity } from "../utils/identity";
import type { QuickLabel } from "../utils/quickLabels";
import {
  PdfReaderNavigationPanel,
  PdfReaderToolbar,
  type PdfNavigationMode,
} from "./PdfReaderControls";
import {
  PdfSelectionFinalizer,
  buildPdfSearchIndex,
  flattenPdfOutline,
  parsePdfReaderMemory,
  searchPdfIndex,
  type PdfOutlineEntry,
  type PdfSearchPage,
  type PdfSearchResult,
} from "../utils/pdfReader";
import "./PdfAnnotatorView.css";

type PdfHighlight = PdfAnnotation & IHighlight;
type PdfDocumentProxy = Parameters<React.ComponentProps<typeof PdfLoader>["children"]>[0];
// Pinned react-pdf-highlighter forwards these PDF.js options in getDocument's
// props spread, but its declaration omits them. Keep the extension narrow here.
const ConfiguredPdfLoader = PdfLoader as unknown as React.ComponentType<React.ComponentProps<typeof PdfLoader> & {
  standardFontDataUrl?: string;
  isEvalSupported?: boolean;
}>;

export interface PdfReaderHost {
  /** A new token requests navigation even when the requested page is unchanged. */
  pageRequest?: { page: number; token: number };
  restoreView?: boolean;
  showProgress?: boolean;
  /** Namespace in-tab comment drafts by the host's verified source identity. */
  draftNamespace?: string;
  onReady?: (pageCount: number) => void;
  onInteraction?: (event: { kind: 'page' | 'selection' | 'annotation'; page?: number }) => void;
}

export interface PdfAnnotatorViewProps {
  pdfUrl?: string;
  workerSrc?: string;
  cMapUrl?: string;
  standardFontDataUrl?: string;
  host?: PdfReaderHost;
  annotations: PdfAnnotation[];
  labels: PdfAnnotationDocument["labels"];
  pageMapping?: PdfPageMapping;
  selectedAnnotationId: string | null;
  readOnly?: boolean;
  onAddAnnotation: (annotation: PdfAnnotation) => void;
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAreaAnnotation: (
    id: string,
    position: Partial<PdfAnnotation["position"]>,
    content: Partial<PdfAnnotation["content"]>,
  ) => void;
}

function nextId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function annotationColor(annotation: PdfAnnotation): PdfAnnotationColor {
  return annotation.comment?.color || annotation.color || "yellow";
}

function annotationAuthor(annotation: PdfAnnotation): string {
  return annotation.comment?.author || annotation.author || getIdentity();
}

function annotationNote(annotation: PdfAnnotation): string {
  return annotation.comment?.text || annotation.note || "";
}

function pageLabelFor(page: number, mapping?: PdfPageMapping): string {
  const explicit = mapping?.labels?.[String(page)];
  if (explicit !== undefined) return String(explicit);
  if (mapping?.pdf_page !== undefined && mapping.label !== undefined) {
    const label = Number(mapping.label);
    if (Number.isFinite(label)) return String(page + (label - mapping.pdf_page));
  }
  if (mapping?.pdf_page_1_is !== undefined) {
    const label = Number(mapping.pdf_page_1_is);
    if (Number.isFinite(label)) return String(page + label - 1);
  }
  return String(page);
}

function normalizeHighlight(
  highlight: NewHighlight,
  options: { color: PdfAnnotationColor; label: string; note: string },
  pageMapping?: PdfPageMapping,
): PdfHighlight {
  const author = getIdentity();
  const page = highlight.position.pageNumber;
  return {
    ...highlight,
    id: nextId(),
    color: options.color,
    label: options.label,
    author,
    note: options.note,
    highlighted_text: highlight.content.text,
    page,
    pdf_page: page,
    page_label: pageLabelFor(page, pageMapping),
    created_at: new Date().toISOString(),
    comment: {
      text: options.note,
      emoji: "",
      color: options.color,
      author,
    },
  } as PdfHighlight;
}

export function pdfQuickLabels(labels: PdfAnnotationDocument["labels"]): QuickLabel[] {
  return (Object.entries(labels) as Array<[PdfAnnotationColor, string]>).map(([color, text]) => ({
    id: `pdf-${color}`,
    emoji: "●",
    text,
    color,
  }));
}

function PdfSelectionComposer({
  highlight,
  labels,
  draftNamespace = 'pdf',
  reveal,
  dismiss,
  create,
}: {
  highlight: NewHighlight;
  labels: PdfAnnotationDocument["labels"];
  draftNamespace?: string;
  reveal: () => void;
  dismiss: () => void;
  create: (options: { color: PdfAnnotationColor; label: string; note: string }) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null);
  const [mode, setMode] = useState<"toolbar" | "comment">("toolbar");
  const quickLabels = useMemo(() => pdfQuickLabels(labels), [labels]);

  useEffect(() => reveal(), [reveal]);

  const finish = useCallback((options: { color: PdfAnnotationColor; label: string; note: string }) => {
    create(options);
    dismiss();
  }, [create, dismiss]);

  return (
    <>
      <span ref={setAnchorEl} className="pn-pdf-selection-anchor" aria-hidden="true" />
      {anchorEl && mode === "toolbar" ? (
        <AnnotationToolbar
          element={anchorEl}
          positionMode="center-above"
          onAnnotate={() => {}}
          onClose={dismiss}
          onRequestComment={() => setMode("comment")}
          onQuickLabel={(label) => finish({
            color: isPdfAnnotationColor(label.color) ? label.color : "yellow",
            label: label.text,
            note: "",
          })}
          quickLabels={quickLabels}
          showQuickApprove={false}
          hideDelete
          copyText={highlight.content.text}
        />
      ) : null}
      {anchorEl && mode === "comment" ? (
        <CommentPopover
          anchorEl={anchorEl}
          contextText={highlight.content.text || "Area highlight"}
          isGlobal={false}
          allowImages={false}
          draftKey={`${draftNamespace}:${highlight.position.pageNumber}:${highlight.content.text || "area"}`}
          onSubmit={(note) => finish({ color: "yellow", label: "Comment", note })}
          onClose={dismiss}
        />
      ) : null}
    </>
  );
}

function HighlightPopup({
  annotation,
  labels,
}: {
  annotation: PdfAnnotation;
  labels: PdfAnnotationDocument["labels"];
}) {
  const color = annotationColor(annotation);
  return (
    <div className={`pn-pdf-highlight-popup popup-${color}`}>
      <b>{annotation.label || labels[color]}</b>
      {annotationNote(annotation) ? <div>{annotationNote(annotation)}</div> : null}
      {annotationAuthor(annotation) ? <div className="pn-pdf-muted">by {annotationAuthor(annotation)}</div> : null}
    </div>
  );
}

function PdfDocumentReader({
  pdfDocument,
  pdfUrl,
  host,
  annotations,
  labels,
  pageMapping,
  selectedAnnotationId,
  readOnly,
  onAddAnnotation,
  onSelectAnnotation,
  onUpdateAreaAnnotation,
}: {
  pdfDocument: PdfDocumentProxy;
  pdfUrl: string;
  host?: PdfReaderHost;
  annotations: PdfAnnotation[];
  labels: PdfAnnotationDocument["labels"];
  pageMapping?: PdfPageMapping;
  selectedAnnotationId: string | null;
  readOnly: boolean;
  onAddAnnotation: (annotation: PdfAnnotation) => void;
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAreaAnnotation: PdfAnnotatorViewProps["onUpdateAreaAnnotation"];
}) {
  const hostRef = useRef(host); hostRef.current = host;
  const manualScrollRef = useRef(false);
  const scrollToRef = useRef<(highlight: IHighlight) => void>(() => {});
  const highlighterRef = useRef<PdfHighlighter<PdfHighlight> | null>(null);
  const selectionFinalizerRef = useRef<PdfSelectionFinalizer | null>(null);
  const memoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIndexRef = useRef<Promise<PdfSearchPage[]> | null>(null);
  const scaleValueRef = useRef("page-width");
  const [readerRevision, setReaderRevision] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfScaleValue, setPdfScaleValue] = useState("page-width");
  const [scalePercent, setScalePercent] = useState(100);
  const [navigationMode, setNavigationMode] = useState<PdfNavigationMode>(null);
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([]);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [outlineLoaded, setOutlineLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<PdfSearchResult[]>([]);
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const highlights = annotations as PdfHighlight[];
  const memoryKey = useMemo(() => {
    const fingerprint = pdfDocument.fingerprints?.[0] || `${pdfDocument.numPages}:${pdfUrl}`;
    return `plannotator:pdf-reader:${fingerprint}`;
  }, [pdfDocument, pdfUrl]);

  const reader = useCallback(() => highlighterRef.current?.viewer, []);
  const readingViewport = readerRevision > 0 ? reader()?.container ?? null : null;

  const updateReaderState = useCallback(() => {
    const viewer = reader();
    if (!viewer) return;
    setPageNumber(viewer.currentPageNumber || 1);
    setScalePercent(Math.round((viewer.currentScale || 1) * 100));
  }, [reader]);

  const persistReaderState = useCallback(() => {
    if (hostRef.current?.restoreView === false) return;
    const viewer = reader();
    if (!viewer) return;
    if (memoryTimerRef.current) clearTimeout(memoryTimerRef.current);
    memoryTimerRef.current = setTimeout(() => {
      memoryTimerRef.current = null;
      try {
        const currentPage = viewer.currentPageNumber || 1;
        const pageView = viewer.getPageView(currentPage - 1);
        const pageOffset = Math.max(0, viewer.container.scrollTop - (pageView?.div?.offsetTop || 0));
        localStorage.setItem(memoryKey, JSON.stringify({
          pageNumber: currentPage,
          pageOffset,
          scaleValue: scaleValueRef.current,
        }));
      } catch {
        // Browser-local reader memory is optional.
      }
    }, 180);
  }, [memoryKey, reader]);

  const highlightSearchText = useCallback((result?: PdfSearchResult) => {
    const viewer = reader();
    if (!viewer) return;
    viewer.container.querySelectorAll(".pn-pdf-search-hit").forEach((element) => element.classList.remove("pn-pdf-search-hit"));
    if (!result || !searchQuery.trim()) return;
    const query = searchQuery.trim().toLocaleLowerCase();
    setTimeout(() => {
      const page = viewer.container.querySelector(`.page[data-page-number="${result.pageNumber}"]`);
      page?.querySelectorAll(".textLayer span").forEach((span) => {
        if ((span.textContent || "").toLocaleLowerCase().includes(query)) span.classList.add("pn-pdf-search-hit");
      });
    }, 120);
  }, [reader, searchQuery]);

  const goToPage = useCallback((requestedPage: number) => {
    const viewer = reader();
    if (!viewer) return;
    const nextPage = Math.max(1, Math.min(pdfDocument.numPages, Math.round(requestedPage)));
    hostRef.current?.onInteraction?.({ kind: 'page', page: nextPage });
    manualScrollRef.current = false;
    viewer.currentPageNumber = nextPage;
    viewer.scrollPageIntoView({ pageNumber: nextPage });
    setPageNumber(nextPage);
    persistReaderState();
  }, [pdfDocument.numPages, persistReaderState, reader]);

  const setScale = useCallback((value: string | number) => {
    const viewer = reader();
    if (!viewer) return;
    const normalized = typeof value === "number" ? String(Math.max(0.5, Math.min(3, value))) : value;
    scaleValueRef.current = normalized;
    setPdfScaleValue(normalized);
    viewer.currentScaleValue = normalized;
    requestAnimationFrame(() => {
      updateReaderState();
      persistReaderState();
    });
  }, [persistReaderState, reader, updateReaderState]);

  const selectSearchResult = useCallback((index: number, results = searchResults) => {
    if (results.length === 0) return;
    const next = (index + results.length) % results.length;
    setSearchResultIndex(next);
    goToPage(results[next].pageNumber);
    highlightSearchText(results[next]);
  }, [goToPage, highlightSearchText, searchResults]);

  const configureHighlighter = useCallback((instance: PdfHighlighter<PdfHighlight> | null) => {
    selectionFinalizerRef.current?.dispose();
    selectionFinalizerRef.current = null;
    highlighterRef.current = instance;
    if (!instance) return;
    const finalizer = new PdfSelectionFinalizer(() => instance.afterSelection());
    selectionFinalizerRef.current = finalizer;
    // react-pdf-highlighter finalizes 500 ms after every selectionchange,
    // including while the primary pointer is still held. The adapter retains
    // keyboard selection debounce but finalizes pointer selection on release.
    instance.debouncedAfterSelection = () => finalizer.selectionChanged();
  }, []);

  useEffect(() => {
    const finishPointerSelection = () => selectionFinalizerRef.current?.finishPointerSelection();
    const holdSelection = () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.anchorNode && highlighterRef.current?.viewer?.container.contains(selection.anchorNode)) {
        hostRef.current?.onInteraction?.({ kind: 'selection' });
      }
    };
    document.addEventListener('selectionchange', holdSelection);
    window.addEventListener("pointerup", finishPointerSelection, true);
    window.addEventListener("pointercancel", finishPointerSelection, true);
    return () => {
      document.removeEventListener('selectionchange', holdSelection);
      window.removeEventListener("pointerup", finishPointerSelection, true);
      window.removeEventListener("pointercancel", finishPointerSelection, true);
      selectionFinalizerRef.current?.dispose();
      if (memoryTimerRef.current) clearTimeout(memoryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const viewer = reader();
    if (!viewer) return;
    let restored = false;
    try {
      const memory = hostRef.current?.restoreView === false ? null : parsePdfReaderMemory(localStorage.getItem(memoryKey), pdfDocument.numPages);
      if (memory) {
        restored = true;
        scaleValueRef.current = memory.scaleValue;
        setPdfScaleValue(memory.scaleValue);
        viewer.currentScaleValue = memory.scaleValue;
        viewer.currentPageNumber = memory.pageNumber;
        viewer.scrollPageIntoView({ pageNumber: memory.pageNumber });
        requestAnimationFrame(() => {
          const pageView = viewer.getPageView(memory.pageNumber - 1);
          viewer.container.scrollTop = (pageView?.div?.offsetTop || 0) + memory.pageOffset;
          updateReaderState();
        });
      }
    } catch {
      // Ignore unavailable browser storage.
    }
    if (!restored) {
      scaleValueRef.current = "page-width";
      setPdfScaleValue("page-width");
      viewer.currentScaleValue = "page-width";
      updateReaderState();
    }
    hostRef.current?.onReady?.(pdfDocument.numPages);
    let scrollFrame = 0;
    const handleScroll = () => {
      cancelAnimationFrame(scrollFrame);
      // PDF.js updates currentPageNumber in its scroll RAF, not synchronously.
      scrollFrame = requestAnimationFrame(() => {
        if (manualScrollRef.current) hostRef.current?.onInteraction?.({ kind: 'page', page: viewer.currentPageNumber || 1 });
        updateReaderState();
        persistReaderState();
      });
    };
    viewer.container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(scrollFrame);
      viewer.container.removeEventListener("scroll", handleScroll);
    };
  }, [memoryKey, pdfDocument.numPages, persistReaderState, reader, readerRevision, updateReaderState]);

  useEffect(() => {
    const viewer = reader(), request = host?.pageRequest;
    if (!viewer || !request || !Number.isSafeInteger(request.page) || request.page < 1 || request.page > pdfDocument.numPages) return;
    manualScrollRef.current = false;
    viewer.currentPageNumber = request.page;
    viewer.scrollPageIntoView({ pageNumber: request.page });
    updateReaderState();
  }, [host?.pageRequest?.token, host?.pageRequest?.page, readerRevision, reader, pdfDocument.numPages, updateReaderState]);

  useEffect(() => {
    if (navigationMode !== "outline" || outlineLoaded) return;
    let cancelled = false;
    setOutlineBusy(true);
    void pdfDocument.getOutline()
      .then((values) => flattenPdfOutline(pdfDocument, values))
      .then((entries) => { if (!cancelled) setOutline(entries); })
      .catch(() => { if (!cancelled) setOutline([]); })
      .finally(() => {
        if (!cancelled) {
          setOutlineBusy(false);
          setOutlineLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [navigationMode, outlineLoaded, pdfDocument]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchBusy(false);
      setSearchResults([]);
      setSearchResultIndex(0);
      highlightSearchText(undefined);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearchBusy(true);
      searchIndexRef.current ??= buildPdfSearchIndex(pdfDocument);
      void searchIndexRef.current
        .then((index) => searchPdfIndex(index, query))
        .then((results) => {
          if (cancelled) return;
          setSearchResults(results);
          setSearchResultIndex(0);
          if (results.length > 0) {
            goToPage(results[0].pageNumber);
            highlightSearchText(results[0]);
          }
        })
        .finally(() => { if (!cancelled) setSearchBusy(false); });
    }, 240);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [goToPage, highlightSearchText, pdfDocument, searchQuery]);

  useEffect(() => {
    if (!selectedAnnotationId) return;
    const selected = highlights.find(({ id }) => id === selectedAnnotationId);
    if (selected) {
      hostRef.current?.onInteraction?.({ kind: 'annotation', page: selected.position.pageNumber });
      manualScrollRef.current = false;
      scrollToRef.current(selected);
    }
  }, [highlights, selectedAnnotationId]);

  return (
    <>
      <PdfReaderToolbar
        pageNumber={pageNumber}
        pageCount={pdfDocument.numPages}
        scalePercent={scalePercent}
        searchQuery={searchQuery}
        searchBusy={searchBusy}
        searchResults={searchResults}
        searchIndex={searchResultIndex}
        navigationMode={navigationMode}
        onPageChange={goToPage}
        onZoomOut={() => setScale((reader()?.currentScale || 1) - 0.15)}
        onZoomIn={() => setScale((reader()?.currentScale || 1) + 0.15)}
        onFitWidth={() => setScale("page-width")}
        onResetZoom={() => setScale(1)}
        onSearchQueryChange={setSearchQuery}
        onPreviousSearchResult={() => selectSearchResult(searchResultIndex - 1)}
        onNextSearchResult={() => selectSearchResult(searchResultIndex + 1)}
        onNavigationModeChange={setNavigationMode}
      />
      {host?.showProgress !== false && <ReadingProgressBar viewport={readingViewport} resetKey={pdfUrl} />}
      <div className="pn-pdf-reader-body">
        {navigationMode ? (
          <PdfReaderNavigationPanel
            mode={navigationMode}
            document={pdfDocument}
            outline={outline}
            outlineBusy={outlineBusy}
            pageNumber={pageNumber}
            onPageChange={goToPage}
          />
        ) : null}
        <main
          className="pn-pdf-viewer"
          onWheelCapture={() => { manualScrollRef.current = true; }}
          onTouchMoveCapture={() => { manualScrollRef.current = true; }}
          onKeyDownCapture={(event) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) manualScrollRef.current = true; }}
          onPointerDownCapture={(event) => {
            if (event.button !== 0 || !(event.target instanceof Element)) return;
            manualScrollRef.current = true;
            if (event.target.closest(".textLayer")) selectionFinalizerRef.current?.beginPointerSelection();
          }}
        >
          <PdfHighlighter
            ref={configureHighlighter}
            pdfDocument={pdfDocument}
            pdfScaleValue={pdfScaleValue}
            enableAreaSelection={(event) => !readOnly && event.altKey}
            onScrollChange={() => {}}
            scrollRef={(scrollTo) => {
              scrollToRef.current = scrollTo;
              setReaderRevision((revision) => revision + 1);
            }}
            onSelectionFinished={(position, content, hide, transform) => {
              if (readOnly) {
                hide();
                return null;
              }
              hostRef.current?.onInteraction?.({ kind: 'selection', page: position.pageNumber });
              const highlight = { content, position } as NewHighlight;
              return (
                <PdfSelectionComposer
                  highlight={highlight}
                  labels={labels}
                  draftNamespace={host?.draftNamespace}
                  reveal={transform}
                  dismiss={hide}
                  create={(options) => onAddAnnotation(normalizeHighlight(highlight, options, pageMapping))}
                />
              );
            }}
            highlightTransform={(highlight, index, setTip, hideTip, viewportToScaled, screenshot, isScrolledTo) => {
              const annotation = highlight as PdfHighlight;
              const className = `pn-pdf-annotation-${annotationColor(annotation)}${selectedAnnotationId === annotation.id ? " pn-pdf-annotation-selected" : ""}`;
              const rendered = highlight.content?.image ? (
                <div className={className} onClick={() => onSelectAnnotation(highlight.id)}>
                  <AreaHighlight
                    isScrolledTo={isScrolledTo}
                    highlight={highlight}
                    onChange={(boundingRect) => {
                      if (readOnly) return;
                      onUpdateAreaAnnotation(
                        highlight.id,
                        { boundingRect: viewportToScaled(boundingRect) as PdfAnnotation["position"]["boundingRect"] },
                        { image: screenshot(boundingRect) },
                      );
                    }}
                  />
                </div>
              ) : (
                <div className={className}>
                  <Highlight
                    isScrolledTo={isScrolledTo}
                    position={highlight.position}
                    comment={{ ...highlight.comment, emoji: "" }}
                    onClick={() => onSelectAnnotation(highlight.id)}
                  />
                </div>
              );
              return (
                <Popup
                  key={index}
                  popupContent={<HighlightPopup annotation={annotation} labels={labels} />}
                  onMouseOver={(content) => setTip(highlight, () => content)}
                  onMouseOut={hideTip}
                >
                  {rendered}
                </Popup>
              );
            }}
            highlights={highlights}
          />
        </main>
      </div>
    </>
  );
}

/** PDF renderer and selection adapter. App owns annotation state, panel, and saving. */
export function PdfAnnotatorView({
  pdfUrl = "/api/pdf",
  workerSrc,
  cMapUrl,
  standardFontDataUrl,
  host,
  annotations,
  labels,
  pageMapping,
  selectedAnnotationId,
  readOnly = false,
  onAddAnnotation,
  onSelectAnnotation,
  onUpdateAreaAnnotation,
}: PdfAnnotatorViewProps) {
  return (
    <div className="pn-pdf-surface" data-pdf-annotator>
      <ConfiguredPdfLoader url={pdfUrl} workerSrc={workerSrc} cMapUrl={cMapUrl} cMapPacked={Boolean(cMapUrl)} standardFontDataUrl={standardFontDataUrl} isEvalSupported={host ? false : undefined} errorMessage={<div role="alert">PDF could not load.</div>} beforeLoad={<div className="pn-pdf-loading">Loading PDF…</div>}>
        {(pdfDocument) => (
          <PdfDocumentReader
            pdfDocument={pdfDocument}
            pdfUrl={pdfUrl}
            host={host}
            annotations={annotations}
            labels={labels}
            pageMapping={pageMapping}
            selectedAnnotationId={selectedAnnotationId}
            readOnly={readOnly}
            onAddAnnotation={onAddAnnotation}
            onSelectAnnotation={onSelectAnnotation}
            onUpdateAreaAnnotation={onUpdateAreaAnnotation}
          />
        )}
      </ConfiguredPdfLoader>
    </div>
  );
}
