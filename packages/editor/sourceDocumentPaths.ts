import {
  dirnameBrowserPath,
  normalizeBrowserPath,
} from '@plannotator/shared/browser-paths';

export {
  dirnameBrowserPath,
  normalizeBrowserPath,
  pathIsInsideDir,
} from '@plannotator/shared/browser-paths';

export function canEditLinkedSourceDocument(options: {
  linked: boolean;
  sourceSaveEnabled: boolean;
  annotateSource: 'file' | 'message' | 'folder' | null;
  pdfNavigationMode: boolean;
}): boolean {
  if (!options.linked) return true;
  return options.sourceSaveEnabled && (
    options.annotateSource === 'folder' || options.pdfNavigationMode
  );
}

export interface SourceWatchSubscription {
  query: string;
  dirs: string[];
  key: string;
}

export function buildSourceWatchSubscription(paths: string[]): SourceWatchSubscription {
  const normalizedPaths = [...new Set(paths.map(normalizeBrowserPath).filter(Boolean))].sort();
  const params = new URLSearchParams();
  for (const path of normalizedPaths) params.append('filePath', path);

  return {
    query: params.toString(),
    dirs: [...new Set(normalizedPaths.map(dirnameBrowserPath))].sort(),
    key: normalizedPaths.join('\n'),
  };
}
