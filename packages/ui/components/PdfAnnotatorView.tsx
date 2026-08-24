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
import { getIdentity } from "../utils/identity";
import type { QuickLabel } from "../utils/quickLabels";
import "./PdfAnnotatorView.css";

type PdfHighlight = PdfAnnotation & IHighlight;

export interface PdfAnnotatorViewProps {
  pdfUrl?: string;
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
  reveal,
  dismiss,
  create,
}: {
  highlight: NewHighlight;
  labels: PdfAnnotationDocument["labels"];
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
          copyText={highlight.content.text}
          commentOnly
        />
      ) : null}
      {anchorEl && mode === "comment" ? (
        <CommentPopover
          anchorEl={anchorEl}
          contextText={highlight.content.text || "Area highlight"}
          isGlobal={false}
          allowImages={false}
          draftKey={`pdf:${highlight.position.pageNumber}:${highlight.content.text || "area"}`}
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

/** PDF renderer and selection adapter. App owns annotation state, panel, and saving. */
export function PdfAnnotatorView({
  pdfUrl = "/api/pdf",
  annotations,
  labels,
  pageMapping,
  selectedAnnotationId,
  readOnly = false,
  onAddAnnotation,
  onSelectAnnotation,
  onUpdateAreaAnnotation,
}: PdfAnnotatorViewProps) {
  const scrollToRef = useRef<(highlight: IHighlight) => void>(() => {});
  const highlights = annotations as PdfHighlight[];

  useEffect(() => {
    if (!selectedAnnotationId) return;
    const selected = highlights.find(({ id }) => id === selectedAnnotationId);
    if (selected) scrollToRef.current(selected);
  }, [highlights, selectedAnnotationId]);

  return (
    <div className="pn-pdf-surface" data-pdf-annotator>
      <main className="pn-pdf-viewer">
        <PdfLoader url={pdfUrl} beforeLoad={<div className="pn-pdf-loading">Loading PDF…</div>}>
          {(pdfDocument) => (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              enableAreaSelection={(event) => !readOnly && event.altKey}
              onScrollChange={() => {}}
              scrollRef={(scrollTo) => { scrollToRef.current = scrollTo; }}
              onSelectionFinished={(position, content, hide, transform) => {
                if (readOnly) {
                  hide();
                  return null;
                }
                const highlight = { content, position } as NewHighlight;
                return (
                  <PdfSelectionComposer
                    highlight={highlight}
                    labels={labels}
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
          )}
        </PdfLoader>
      </main>
    </div>
  );
}
