# Native Plannotator PDF annotation refinement

## Target

Refactor the working PDF prototype on `feature/pdf-annotations` so that PDF is a Plannotator document surface rather than a separate Pi Annotate-style application embedded in the shell. Preserve the proven PDF streaming, sidecar, command, and folder-resolution layers.

## Implementation status — 2026-08-24

Implemented locally:

- PDF sidecars project into the native Plannotator `Annotation` model with additive page/coordinate metadata;
- the standard annotation panel, card selection, note editing, deletion, relabeling, resize handle, count badge, and compact/mobile stage now handle PDF annotations;
- PDF selection uses Plannotator's `AnnotationToolbar`, `CommentPopover`, and configurable quick-label picker;
- `PdfAnnotatorView` is reduced to the PDF renderer and coordinate-selection adapter;
- sidecar state, dirty tracking, native discard confirmation, `Save`, `Save & Done`, and keyboard saving are owned by `App`;
- the remote helper retains the 2 MB text limit but delegates large PDFs to the PDF-aware fork;
- Markdown selected from the file pane after a direct PDF open receives a workspace-bounded source-save capability and can enter normal direct-edit mode;
- portalled PDF selection controls isolate pointer events from `react-pdf-highlighter`, so quick-label clicks create annotations instead of dismissing the selection before `click` fires;
- PDF document-level comments reuse the native global-comment composer and panel cards, persist separately in `metadata/annotations-global.json`, and are mirrored into `annotations.md` without changing `source.pdf`;
- focused projection, panel, label, global-comment, sidecar, target, server, helper, Markdown regression, typecheck, and Pi production-build validation pass.

Pending: close the still-running prototype session and reopen the Green IT PDF for the final EikLaptop interaction check.

## Diagnosis

The prototype demonstrates the data path, but diverges from Plannotator's interaction model:

- `PdfAnnotatorView` owns a separate left sidebar, annotation cards, edit form, save actions, status state, and browser dialogs.
- `App` disables Plannotator's normal annotation panel, panel toggle, and responsive annotation stages while PDF is active.
- The academic labels are hard-coded in the viewer rather than supplied by the PDF document adapter.
- PDF selection bypasses Plannotator's `AnnotationToolbar`, `CommentPopover`, and quick-label components.
- The helper used by remote annotation rejects PDFs over the legacy 2 MB text limit before the fork can classify them.

The server and storage design remain usable. This refinement is primarily an editor/UI state integration change.

## Keep

- binary PDF target classification;
- secure range streaming in Bun and Pi;
- atomic sidecar writes and hidden-imported-annotation behavior;
- unchanged `source.pdf` bytes on ordinary saves;
- direct commands, folder discovery, and `/plannotator-open`;
- the existing `react-pdf-highlighter` coordinate renderer.

## Replace

### 1. Native annotation model projection

Project each sidecar `PdfAnnotation` into Plannotator's normal `Annotation` model for presentation, with an additive PDF anchor carrying page, coordinates, semantic label, and imported state. Keep the sidecar model canonical for persistence.

The projection must support:

- quote and note rendering in the existing annotation cards;
- author and timestamp display;
- page/label metadata in the card header;
- native selection, edit, and delete handlers;
- coordinate scrolling in the PDF reader.

### 2. Native selection and composition

Make `PdfAnnotatorView` a renderer and selection adapter. Replace its bespoke four-button popup with:

- Plannotator's `AnnotationToolbar`;
- Plannotator's `CommentPopover`;
- Plannotator's `FloatingQuickLabelPicker`;
- PDF labels supplied as configured quick labels rather than hard-coded viewer UI.

Text and area selections remain PDF-specific; comment and quick-label composition should look and behave like other Plannotator surfaces.

### 3. Native panel and responsive shell

While a PDF is active:

- re-enable the standard annotation-panel toggle and resize handle;
- render PDF annotations through the standard `AnnotationPanel`;
- reuse compact/mobile annotation stages;
- remove the separate PDF sidebar and edit form;
- keep the PDF canvas as the document area only.

### 4. Document save lifecycle

Keep sidecar saving distinct from agent feedback. Provide a small document-level save lane consistent with source-backed direct editing:

- `Save` persists sidecars and remains in the session;
- `Save & Done` persists, then closes the annotation session;
- native confirmation UI protects unsaved changes on close, back, or file switch;
- no browser `prompt`/`confirm` remains in the PDF component;
- save errors leave the session open and preserve the dirty state.

### 5. Remote helper compatibility

Allow `.pdf` targets to bypass the helper's legacy 2 MB text-document guard. Other files retain the guard. The fork remains responsible for PDF target classification and range streaming.

## Tests

Add or update focused coverage for:

- PDF-to-native annotation projection and edit round-tripping;
- configured PDF quick labels;
- native annotation-panel PDF metadata;
- renderer selection callbacks without sidecar ownership;
- save/close behavior and unchanged PDF bytes;
- remote helper acceptance of large PDFs while retaining the text limit;
- Markdown annotation panel and parser regressions.

Run typecheck, Pi production build, focused Bun/Pi server tests, picker/helper tests, and a live Green IT PDF pass on EikLaptop.

## Acceptance criteria

- The PDF canvas has no independent annotation sidebar or card system.
- PDF selection uses recognizable Plannotator annotation controls.
- The standard annotation panel displays, selects, edits, and removes PDF annotations.
- Desktop and compact/mobile panel paths remain available.
- Academic labels come from the loaded PDF annotation document.
- Sidecars retain the established schema and `source.pdf` remains unchanged on save.
- Markdown, HTML, and text behavior remain unchanged.
- A Green IT PDF larger than 2 MB opens through the approved remote annotation helper.
- `pi-annotate` remains available during parallel validation.
