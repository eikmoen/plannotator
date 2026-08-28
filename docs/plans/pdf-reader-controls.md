# PDF reader controls and selection refinement

## Goal

Extend the native PDF annotation surface with reading controls while preserving the existing annotation panel, sidecar contract, and unchanged `source.pdf` invariant.

## Scope

- prominent document title and author context in the reader header;
- page navigation and current-page indicator;
- zoom out, zoom in, fit width, and reset;
- document text search with result navigation;
- outline and lazy thumbnail navigation;
- browser-local remembered page, intra-page offset, and zoom keyed by PDF fingerprint;
- text-selection finalization on pointer release rather than the highlighter library's 500 ms selection-change debounce.

## Selection diagnosis

`react-pdf-highlighter` currently debounces every `selectionchange` and calls `afterSelection()` after 500 ms even while the primary pointer remains down. A long hold can therefore transform an intermediate range into a pending annotation before the drag has finished. The adapter should suppress intermediate finalization, then finalize once after `pointerup`/`pointercancel`. Keyboard selection remains debounced.

## Constraints

- do not fork or patch installed dependency files;
- keep PDF coordinates and sidecar persistence unchanged;
- do not rewrite `source.pdf` for reader state;
- keep remembered position in browser-local state only;
- load thumbnails lazily and bound outline/search work for large documents;
- retain responsive access to annotations and global comments.

## Implementation status

Implemented:

- centered desktop header metadata from the source package's canonical `metadata.json`, with a filename-derived fallback and the paper title retained in compact layouts;
- page input and previous/next controls;
- zoom in/out, 100% reset, and fit-width controls;
- bounded-concurrency full-document text index, result count/navigation, snippets, and visible-page hit marking;
- resolved nested PDF outline navigation;
- bounded thumbnail rendering that expands as the thumbnail panel scrolls;
- browser-local page, intra-page offset, and zoom restoration keyed by PDF fingerprint;
- pointer-aware selection finalization that suppresses the library's intermediate 500 ms completion while the mouse button remains held.

## Validation

- pure tests pass for selection finalization, outline resolution, search results, and remembered-state parsing;
- focused PDF projection/storage/server tests remain green;
- project typecheck and Pi production builds pass;
- browser smoke test passed on an isolated copy of the Ashrafi academic PDF: 31 search matches, 31 outline entries, 43 page thumbnails with 11 rendered initially and additional thumbnails rendered on scroll, page 4 and 100% zoom restored after reload, and no toolbar appeared during an 800 ms held selection before appearing once after pointer release.
