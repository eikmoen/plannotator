# Plannotator PDF annotation fork

## Objective

Maintain a fork of [`backnotprop/plannotator`](https://github.com/backnotprop/plannotator) that adds PDF as a first-class annotate target while retaining Plannotator's existing Markdown rendering, annotation, and direct-editing workflows. PDF support must preserve the current Pi Annotate academic annotation workflow and source-folder compatibility.

The first release should open an existing `source.pdf`, render existing annotations, allow annotation creation and editing, and save the same Markdown/JSON sidecars used today. Existing `.md`, `.mdx`, `.txt`, HTML, and supported plain-text annotation behavior must continue without regression. It should not require rewriting existing course literature packages.

## Basis

- Plannotator is dual licensed under MIT or Apache-2.0 and documents forking and contribution in `CONTRIBUTING.md`.
- Upstream commit inspected for this plan: `1080436d36892b021d5057e46dd01f7039522cf9`.
- Upstream centralizes annotatable type predicates in `packages/core/annotatable.ts` and maintains separate Bun and Pi annotate servers.
- Pi Annotate already implements PDF rendering and coordinate highlights with `react-pdf-highlighter` in `app/src/main.tsx`.
- Pi Annotate already writes the required sidecars in `extension/index.ts` and consumes `@plannotator/ui` and `@plannotator/core`.

## Implementation status — 2026-08-24

Implemented on `feature/pdf-annotations`:

- fork baseline established from upstream `1080436d36892b021d5057e46dd01f7039522cf9`;
- PDF classified separately from UTF-8 annotate documents;
- compatible sidecar loading, normalization, hiding, Markdown rendering, and atomic replacement;
- matching Bun and Pi PDF streaming/annotation APIs with HTTP range support;
- direct `plannotator annotate source.pdf` and `/plannotator-annotate source.pdf` resolution;
- PDF discovery and opening from Plannotator's internal folder browser;
- Plannotator-hosted PDF reader with the four academic labels, note editing, deletion, saving, and imported annotations;
- focused server/storage/resolution tests, full typecheck, Pi build, and a live rendered-PDF save test against a copied literature package;
- `/plannotator-open` updated to discover and forward PDFs;
- Devbox global Pi settings switched from the npm release to the local fork;
- end-to-end Pi command startup verified `renderAs: "pdf"` through the normal `/plannotator-annotate source.pdf` command and EikLaptop handoff path;
- live save verification confirmed that sidecars changed while the PDF SHA-256 remained unchanged;
- the initial standalone PDF sidebar was subsequently replaced by the native Plannotator annotation panel, cards, composer, quick-label picker, save state, and responsive shell integration described in `pdf-native-annotation-refinement.md`.

Still pending in later slices:

- a broader compatibility fixture matrix and parallel-use period;
- optional explicit embedding into PDF bytes.

## Non-negotiable data contract

PDF support must preserve this source layout:

```text
<source-key>/
├── source.pdf
├── annotations.md
└── metadata/
    ├── annotations.json
    ├── annotations-raw.json
    ├── annotations-hidden.json
    ├── metadata.json
    └── migration-report.json
```

Roles:

- `source.pdf`: source document and, when explicitly requested, visible embedded highlights;
- `metadata/annotations.json`: normalized editable annotations with coordinates, quotation, PDF page, displayed page label, semantic label/color, note, author, and timestamps;
- `annotations.md`: human-readable Obsidian index with direct `source.pdf#page=N` links;
- `metadata/annotations-raw.json`: extraction provenance for annotations embedded in the PDF;
- `metadata/annotations-hidden.json`: tombstones for imported annotations hidden in the UI;
- `metadata/metadata.json`: source metadata and optional page-label mapping;
- `metadata/migration-report.json`: migration and synchronization report.

Browser-created annotations remain sidecar-first in the initial release. Saving annotations must not silently rewrite `source.pdf`.

## Architecture

```text
Plannotator fork
├── packages/core
│   ├── annotatable target classification
│   └── PDF annotation and sidecar types
├── packages/ui
│   └── PdfAnnotatorView
├── packages/server
│   └── Bun PDF streaming and sidecar endpoints
├── apps/pi-extension/server
│   └── matching Node/Pi endpoints
├── packages/editor
│   └── annotate-mode PDF surface integration
└── apps/pi-extension
    └── /plannotator-annotate file.pdf support
```

`PdfAnnotatorView` should reuse the working Pi Annotate PDF engine and Plannotator shell. Academic storage logic should be isolated from the viewer behind a narrow adapter so the UI is not tied directly to one directory convention.

Proposed seam:

```ts
interface PdfAnnotationAdapter {
  load(source: PdfSourceDescriptor): Promise<PdfAnnotationDocument>;
  save(source: PdfSourceDescriptor, annotations: PdfAnnotation[]): Promise<void>;
}
```

The default adapter in the fork implements the current source-folder layout. The viewer receives labels as configuration rather than hard-coding course-specific behavior.

## Implementation sequence

### 0. Establish the fork

- Create `eikmoen/plannotator` from `backnotprop/plannotator`.
- Clone it to `/home/eikmoen/repos/plannotator`.
- Configure `origin` as the fork and `upstream` as `backnotprop/plannotator`.
- Record the upstream baseline commit.
- Run upstream tests, typecheck, and Pi build before modification.
- Develop PDF support on a bounded feature branch; do not work directly on the fork's default branch.

Exit condition: the unmodified fork builds and tests locally.

### 1. Introduce binary annotate-target classification

- Add PDF as an annotatable target kind without treating it as UTF-8 text or applying the existing 2 MB text-document cap.
- Keep the existing plain-text/HTML predicates intact.
- Add shared browser-safe types for PDF sources, coordinates, labels, notes, authors, page mappings, and imported/embedded state.
- Add fixture-based compatibility tests using current `metadata/annotations.json` examples.

Exit condition: `.pdf` resolves as a distinct binary annotation surface in shared target resolution, folder discovery, CLI parsing, and the Pi parser.

### 2. Add secure PDF and sidecar server APIs

Implement equivalent endpoints in both server runtimes:

- stream the selected PDF, including HTTP range requests required by PDF.js;
- load normalized, raw, and hidden annotation sidecars;
- load page mapping from `metadata/metadata.json`;
- atomically save `metadata/annotations.json` and the bounded `## Browser annotations` section in `annotations.md`;
- prevent path traversal and writes outside the selected source package;
- avoid copying large PDF binaries into ordinary annotate history.

Storage code should be shared where runtime-independent. Runtime adapters should contain only Bun versus Node HTTP differences.

Exit condition: API tests demonstrate equivalent Bun and Pi behavior, atomic sidecar updates, and unchanged PDF hashes after browser saves.

### 3. Integrate the PDF annotation surface

- Port the working `react-pdf-highlighter` rendering and coordinate model from Pi Annotate.
- Mount it as `PdfAnnotatorView` inside Plannotator's annotate-mode shell.
- Reuse Plannotator theme tokens, responsive panels, buttons, dialogs, shortcuts, and annotation-card patterns.
- Preserve:
  - text and area highlights;
  - page-coordinate anchors;
  - four current labels: Anchor, Definition, Example, Thesis;
  - keyboard shortcuts `1`–`4` and `Escape`;
  - optional note and author editing;
  - imported annotation display;
  - deletion/hiding behavior;
  - page-label mapping;
  - page and visual reading-order sorting.

Exit condition: an existing source package renders without migration and can round-trip annotations without schema drift.

### 4. Connect commands and file browsers

- Support `plannotator annotate path/to/source.pdf`.
- Include PDFs in Plannotator folder discovery and file-browser results.
- Support `/plannotator-annotate path/to/source.pdf` in Pi.
- Add `.pdf` to the global `/plannotator-open` picker only after the forked command can open it successfully.
- Preserve the Devbox tailnet gateway and automatic EikLaptop browser handoff.

Exit condition: selecting a PDF from `/plannotator-open` opens one Plannotator session on EikLaptop and saves to the source package on Devbox.

### 5. Validate compatibility and migration

Use representative source packages containing:

1. no annotations;
2. browser-created sidecar annotations;
3. embedded PDF annotations plus normalized sidecars;
4. hidden imported annotations;
5. page-number offsets;
6. landscape and multi-column pages;
7. large PDFs.

For each fixture, verify:

- a no-op open/save does not change annotation meaning or PDF bytes;
- add, edit, recolor, relabel, and delete operations persist correctly;
- `annotations.md` retains hand-written sections outside the bounded generated block;
- Obsidian links use real PDF pages while displayed labels follow page mapping;
- annotations reload at the same visual coordinates;
- error and interrupted-write paths preserve the previous sidecars.

Exit condition: compatibility tests, typecheck, production builds, and a live EikLaptop review pass.

### 6. Cut over without destructive cleanup

- Keep Pi Annotate available during an initial parallel-use period.
- Point the studies workspace PDF workflow to the fork only after parity is confirmed.
- Archive Pi Annotate rather than deleting it; retain its migration and embed-and-sync scripts until equivalent commands exist in the fork.
- Document the fork version and upstream baseline in global Pi configuration.

Exit condition: normal PDF annotation uses Plannotator, while rollback remains possible without data conversion.

### 7. Optional visible-PDF embedding

Treat PDF mutation as a separate follow-up:

- add an explicit **Embed highlights into PDF** action or command;
- create a recoverable backup/version before replacing the PDF;
- embed only normalized annotations not already represented in the document;
- re-extract and compare sidecars after embedding;
- never embed automatically on ordinary **Done**.

This phase does not block first-class PDF annotation support.

## Acceptance criteria

- Existing Markdown rendering, annotation, direct editing, and folder navigation continue to pass upstream tests and live checks.
- Existing literature packages open without migration.
- The five sidecar roles remain distinguishable and documented.
- Existing sidecar annotations render at their stored coordinates.
- Browser edits update `metadata/annotations.json` and the bounded Markdown section atomically.
- Ordinary saves leave `source.pdf` byte-for-byte unchanged.
- Imported/embedded annotations are not duplicated.
- Hidden imported annotations remain hidden.
- Page-label mappings remain correct.
- Bun and Pi server behavior is covered by matching tests.
- `/plannotator-open` can find and open PDFs after command support lands.
- Devbox sessions remain tailnet-only and open on EikLaptop through the existing gateway.
- Pi Annotate is not retired until browser parity is manually confirmed.

## Out of scope for the first release

- automatic OCR;
- citation-manager integration;
- collaborative multi-user annotation;
- automatic PDF rewriting;
- cross-document synthesis;
- changing the current academic label taxonomy;
- deleting or converting existing sidecars;
- retiring Pi Annotate before parity.

## Upstream strategy

Keep fork-only academic defaults small. Where possible, separate contributions into upstreamable units:

1. binary annotate-target classification;
2. generic PDF document-view seam;
3. reusable PDF annotation types and UI primitives;
4. server range-streaming and secure sidecar hooks.

The current source-folder convention and academic labels can remain adapter/configuration behavior in the fork. This reduces long-term rebase cost while preserving the studies workflow.
