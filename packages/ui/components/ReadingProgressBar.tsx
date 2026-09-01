import React from 'react';
import { useReadingProgress } from '../hooks/useReadingProgress';

export interface ReadingProgressBarProps {
  viewport: HTMLElement | null;
  resetKey?: string | number;
  className?: string;
}

/** A compact, non-interactive indicator for progress through the active reader. */
export function ReadingProgressBar({
  viewport,
  resetKey,
  className = '',
}: ReadingProgressBarProps) {
  const progress = useReadingProgress(viewport, resetKey);
  const percent = Math.round(progress * 100);

  return (
    <div
      data-reading-progress
      data-print-hide
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}% read`}
      title={`Reading progress: ${percent}%`}
      className={`relative h-[3px] w-full shrink-0 overflow-hidden bg-border/40 ${className}`}
    >
      <div
        className="absolute inset-y-0 left-0 w-full origin-left bg-primary/80 transition-transform duration-100 motion-reduce:transition-none"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
