import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AreaHighlight,
  Highlight,
  PdfHighlighter,
  PdfLoader,
  Popup,
} from "react-pdf-highlighter";
import type { Comment, Content, IHighlight, NewHighlight, ScaledPosition } from "react-pdf-highlighter";
import "react-pdf-highlighter/dist/style.css";
import type {
  PdfAnnotation,
  PdfAnnotationColor,
  PdfAnnotationDocument,
} from "@plannotator/core/pdf-annotations";
import { Button } from "./ui/button";
import "./PdfAnnotatorView.css";

const LABELS: Array<{ color: PdfAnnotationColor; label: string; shortcut: string }> = [
  { color: "red", label: "Anchor", shortcut: "1" },
  { color: "blue", label: "Definition", shortcut: "2" },
  { color: "yellow", label: "Example", shortcut: "3" },
  { color: "green", label: "Thesis", shortcut: "4" },
];

type PdfHighlight = PdfAnnotation & IHighlight;
type PdfComment = Comment & { color?: PdfAnnotationColor; author?: string };

type EditDraft = {
  id: string;
  color: PdfAnnotationColor;
  note: string;
  author: string;
};

export interface PdfAnnotatorViewProps {
  pdfUrl?: string;
  annotationsUrl?: string;
  onBack?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDone?: () => void;
}

function nextId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function annotationColor(annotation: PdfAnnotation): PdfAnnotationColor {
  return annotation.comment?.color || annotation.color || "yellow";
}

function annotationAuthor(annotation: PdfAnnotation): string {
  return annotation.comment?.author || annotation.author || "Eik";
}

function annotationNote(annotation: PdfAnnotation): string {
  return annotation.comment?.text || annotation.note || "";
}

function normalizeHighlight(highlight: NewHighlight, comment: PdfComment): PdfHighlight {
  const color = comment.color || "yellow";
  const author = comment.author || "Eik";
  return {
    ...highlight,
    id: nextId(),
    color,
    author,
    note: comment.text,
    highlighted_text: highlight.content.text,
    page: highlight.position.pageNumber,
    pdf_page: highlight.position.pageNumber,
    page_label: String(highlight.position.pageNumber),
    created_at: new Date().toISOString(),
    comment: { ...comment, emoji: "", color, author },
  } as PdfHighlight;
}

function QuickLabelToolbar({
  onOpen,
  onSelect,
  onDismiss,
}: {
  onOpen: () => void;
  onSelect: (color: PdfAnnotationColor) => void;
  onDismiss: () => void;
}) {
  useEffect(() => onOpen(), [onOpen]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      const label = LABELS.find((candidate) => candidate.shortcut === event.key);
      if (!label) return;
      event.preventDefault();
      onSelect(label.color);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss, onSelect]);

  return (
    <div className="pn-pdf-label-toolbar" role="toolbar" aria-label="Choose annotation label">
      {LABELS.map((label) => (
        <Button
          key={label.color}
          type="button"
          variant="outline"
          size="sm"
          className={`pn-pdf-label-button label-${label.color}`}
          aria-keyshortcuts={label.shortcut}
          title={`${label.label} (${label.shortcut})`}
          onClick={() => onSelect(label.color)}
        >
          <span className="pn-pdf-label-dot" aria-hidden="true" />
          <span>{label.label}</span>
          <kbd>{label.shortcut}</kbd>
        </Button>
      ))}
    </div>
  );
}

function HighlightPopup({ annotation }: { annotation: PdfAnnotation }) {
  return (
    <div className={`pn-pdf-highlight-popup popup-${annotationColor(annotation)}`}>
      <b>{LABELS.find(({ color }) => color === annotationColor(annotation))?.label}</b>
      {annotationNote(annotation) ? <div>{annotationNote(annotation)}</div> : null}
      {annotationAuthor(annotation) ? <div className="pn-pdf-muted">by {annotationAuthor(annotation)}</div> : null}
    </div>
  );
}

export function PdfAnnotatorView({
  pdfUrl = "/api/pdf",
  annotationsUrl = "/api/pdf/annotations",
  onBack,
  onDirtyChange,
  onDone,
}: PdfAnnotatorViewProps) {
  const [document, setDocument] = useState<PdfAnnotationDocument | null>(null);
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [status, setStatus] = useState("Loading annotations…");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const scrollToRef = useRef<(highlight: IHighlight) => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    fetch(annotationsUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<PdfAnnotationDocument>;
      })
      .then((loaded) => {
        if (cancelled) return;
        setDocument(loaded);
        setHighlights(loaded.annotations as PdfHighlight[]);
        setStatus(loaded.annotations.length ? `${loaded.annotations.length} annotations loaded` : "No annotations yet");
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : String(error));
      });
    return () => { cancelled = true; };
  }, [annotationsUrl]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const addHighlight = useCallback((highlight: NewHighlight, comment: PdfComment) => {
    setHighlights((current) => [...current, normalizeHighlight(highlight, comment)]);
    setDirty(true);
  }, []);

  const updateAreaHighlight = useCallback((id: string, position: Partial<ScaledPosition>, content: Partial<Content>) => {
    setHighlights((current) => current.map((annotation) => {
      if (annotation.id !== id) return annotation;
      const nextContent = { ...annotation.content, ...content };
      return {
        ...annotation,
        imported: false,
        embedded: false,
        position: { ...annotation.position, ...position },
        content: nextContent,
        highlighted_text: nextContent.text,
      } as PdfHighlight;
    }));
    setDirty(true);
  }, []);

  const save = useCallback(async (finish = false) => {
    setSaving(true);
    setStatus("Saving…");
    try {
      const response = await fetch(annotationsUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ annotations: highlights }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json() as { document?: PdfAnnotationDocument };
      if (result.document) {
        setDocument(result.document);
        setHighlights(result.document.annotations as PdfHighlight[]);
      }
      setDirty(false);
      setStatus("Saved sidecars; PDF unchanged");
      if (finish) {
        await fetch("/api/exit", { method: "POST" });
        onDone?.();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [annotationsUrl, highlights, onDone]);

  const applyEdit = (draft: EditDraft) => {
    setHighlights((current) => current.map((annotation) => annotation.id === draft.id
      ? {
          ...annotation,
          imported: false,
          embedded: false,
          color: draft.color,
          author: draft.author,
          note: draft.note,
          comment: { ...annotation.comment, text: draft.note, color: draft.color, author: draft.author, emoji: "" },
        }
      : annotation));
    setEditing(null);
    setDirty(true);
  };

  return (
    <div className="pn-pdf-surface" data-pdf-annotator>
      <aside className="pn-pdf-sidebar">
        <div>
          <h2>PDF annotations</h2>
          <p className="pn-pdf-muted">Select text, then choose a label. Hold Alt and drag for an area highlight.</p>
          <p className="pn-pdf-label-guide"><b>1</b> Anchor · <b>2</b> Definition · <b>3</b> Example · <b>4</b> Thesis</p>
        </div>
        <div className="pn-pdf-actions">
          {onBack ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (dirty && !window.confirm("Discard unsaved PDF annotation changes?")) return;
                onBack();
              }}
            >Back to files</Button>
          ) : null}
          <Button size="sm" onClick={() => void save(false)} disabled={saving || !document}>Save</Button>
          <Button size="sm" variant="default" onClick={() => void save(true)} disabled={saving || !document}>Save &amp; Done</Button>
        </div>
        <div className={`pn-pdf-status${dirty ? " is-dirty" : ""}`}>{dirty ? "Unsaved changes" : status}</div>
        <div className="pn-pdf-annotation-list">
          {highlights.map((annotation) => (
            <div
              key={annotation.id}
              className={`pn-pdf-annotation-card${selectedId === annotation.id ? " is-selected" : ""}`}
              onClick={() => {
                setSelectedId(annotation.id);
                scrollToRef.current(annotation);
              }}
            >
              <b>{LABELS.find(({ color }) => color === annotationColor(annotation))?.label} · p. {annotation.page_label || annotation.position.pageNumber}</b>
              {annotationNote(annotation) ? <div>{annotationNote(annotation)}</div> : null}
              <div className="pn-pdf-muted">{annotation.content?.text || "[area highlight]"}</div>
              <div className="pn-pdf-card-actions" onClick={(event) => event.stopPropagation()}>
                <Button variant="ghost" size="xs" onClick={() => setEditing({ id: annotation.id, color: annotationColor(annotation), note: annotationNote(annotation), author: annotationAuthor(annotation) })}>Edit</Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    if (!window.confirm("Remove this annotation from the sidecars?")) return;
                    setHighlights((current) => current.filter(({ id }) => id !== annotation.id));
                    setEditing(null);
                    setDirty(true);
                  }}
                >Remove</Button>
              </div>
              {editing?.id === annotation.id ? (
                <form
                  className="pn-pdf-edit-form"
                  onSubmit={(event) => { event.preventDefault(); applyEdit(editing); }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="pn-pdf-color-row">
                    {LABELS.map((label) => (
                      <label key={label.color}>
                        <input type="radio" name={`pdf-color-${annotation.id}`} checked={editing.color === label.color} onChange={() => setEditing({ ...editing, color: label.color })} />
                        {label.label}
                      </label>
                    ))}
                  </div>
                  <label>Note<textarea value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} /></label>
                  <label>By<input value={editing.author} onChange={(event) => setEditing({ ...editing, author: event.target.value })} /></label>
                  <div className="pn-pdf-card-actions">
                    <Button size="xs" type="submit">Apply</Button>
                    <Button size="xs" variant="ghost" type="button" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      </aside>
      <main className="pn-pdf-viewer">
        <PdfLoader url={pdfUrl} beforeLoad={<div className="pn-pdf-loading">Loading PDF…</div>}>
          {(pdfDocument) => (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              enableAreaSelection={(event) => event.altKey}
              onScrollChange={() => {}}
              scrollRef={(scrollTo) => { scrollToRef.current = scrollTo; }}
              onSelectionFinished={(position, content, hide, transform) => (
                <QuickLabelToolbar
                  onOpen={transform}
                  onDismiss={hide}
                  onSelect={(color) => {
                    const author = localStorage.getItem("plannotator-pdf-author") || "Eik";
                    const comment: PdfComment = { text: "", emoji: "", color, author };
                    addHighlight({ content, position, comment }, comment);
                    hide();
                  }}
                />
              )}
              highlightTransform={(highlight, index, setTip, hideTip, viewportToScaled, screenshot, isScrolledTo) => {
                const annotation = highlight as PdfHighlight;
                const className = `pn-pdf-annotation-${annotationColor(annotation)}${selectedId === annotation.id ? " pn-pdf-annotation-selected" : ""}`;
                const rendered = highlight.content?.image ? (
                  <div className={className} onClick={() => setSelectedId(highlight.id)}>
                    <AreaHighlight
                      isScrolledTo={isScrolledTo}
                      highlight={highlight}
                      onChange={(boundingRect) => updateAreaHighlight(highlight.id, { boundingRect: viewportToScaled(boundingRect) }, { image: screenshot(boundingRect) })}
                    />
                  </div>
                ) : (
                  <div className={className}>
                    <Highlight isScrolledTo={isScrolledTo} position={highlight.position} comment={{ ...highlight.comment, emoji: "" }} onClick={() => setSelectedId(highlight.id)} />
                  </div>
                );
                return (
                  <Popup
                    key={index}
                    popupContent={<HighlightPopup annotation={annotation} />}
                    onMouseOver={(content) => setTip(highlight, () => content)}
                    onMouseOut={hideTip}
                  >
                    {rendered}
                  </Popup>
                );
              }}
              highlights={highlights}
            />
          )}
        </PdfLoader>
      </main>
    </div>
  );
}
