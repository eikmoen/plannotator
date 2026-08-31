import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@plannotator/ui/components/ThemeProvider';
import { AppHeader, CompactPlanNavigatorTrigger } from './AppHeader';

const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';
const domClient = hasDom ? await import('react-dom/client') : null;
const act = hasDom ? (await import('react')).act : null;

const noop = () => {};
const headerProps: React.ComponentProps<typeof AppHeader> = {
  isApiMode: true,
  annotateMode: false,
  archiveMode: false,
  goalSetupMode: false,
  goalSetupCanSubmit: false,
  goalSetupIsSubmitting: false,
  goalSetupSubmitLabel: 'Submit',
  gate: false,
  isSharedSession: false,
  origin: 'claude-code',
  isSubmitting: false,
  isExiting: false,
  isPanelOpen: false,
  aiAvailable: true,
  isAIChatOpen: false,
  aiHasMessages: false,
  hasAnyAnnotations: false,
  annotationCount: 0,
  linkedDocIsActive: false,
  callbackShareUrlReady: true,
  canShareCurrentSession: false,
  agentName: 'Claude',
  availableAgents: [],
  showAnnotationsWarning: false,
  annotateApproveLabel: 'Approve',
  annotateApproveTitle: 'Approve',
  callbackConfig: null,
  taterMode: false,
  mobileSettingsOpen: false,
  gitUser: undefined,
  onCallbackFeedback: noop,
  onCallbackApprove: noop,
  onAnnotateExit: noop,
  onGoalSetupExit: noop,
  onGoalSetupSubmit: noop,
  onAnnotateFeedback: noop,
  onAnnotateApprove: noop,
  onFeedback: noop,
  onApprove: noop,
  onAnnotationPanelToggle: noop,
  onAIChatToggle: noop,
  onArchiveCopy: noop,
  onArchiveDone: noop,
  onTaterModeChange: noop,
  onIdentityChange: noop,
  onUIPreferencesChange: noop,
  onOpenSettings: noop,
  onCloseSettings: noop,
  onOpenExport: noop,
  onCopyAgentInstructions: noop,
  onDownloadAnnotations: noop,
  onPrint: noop,
  onCopyShareLink: noop,
  onOpenImport: noop,
  onSaveToObsidian: noop,
  onSaveToBear: noop,
  onSaveToOctarine: noop,
  appVersion: '0.0.0',
  agentInstructionsEnabled: true,
  obsidianConfigured: false,
  bearConfigured: false,
  octarineConfigured: false,
};

describe.skipIf(!hasDom)('PDF document metadata', () => {
  test('renders the paper title and ordered authors front and centre on desktop', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = domClient!.createRoot(host);
    await act!(async () => {
      root.render(
        <ThemeProvider defaultTheme="dark">
          <AppHeader
            {...headerProps}
            pdfDocumentTitle="Business Intelligence and Analytics: From Big Data to Big Impact"
            pdfDocumentAuthors={["Hsinchun Chen", "Roger H. L. Chiang", "Veda C. Storey"]}
          />
        </ThemeProvider>,
      );
    });

    const metadata = host.querySelector<HTMLElement>('[data-pn-pdf-document-metadata]')!;
    expect(metadata).not.toBeNull();
    expect(host.querySelector('[data-pn-pdf-document-title]')?.textContent).toBe('Business Intelligence and Analytics: From Big Data to Big Impact');
    expect(host.querySelector('[data-pn-pdf-document-authors]')?.textContent).toBe('Hsinchun Chen · Roger H. L. Chiang · Veda C. Storey');
    expect(metadata.className).toContain('left-1/2');
    expect(metadata.className).toContain('text-center');
    await act!(async () => root.unmount());
    host.remove();
  });

  test('does not add the metadata header outside a PDF document', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = domClient!.createRoot(host);
    await act!(async () => {
      root.render(
        <ThemeProvider defaultTheme="dark">
          <AppHeader {...headerProps} />
        </ThemeProvider>,
      );
    });

    expect(host.querySelector('[data-pn-pdf-document-metadata]')).toBeNull();
    await act!(async () => root.unmount());
    host.remove();
  });
});

describe('compact Plan navigator trigger', () => {
  test('is a touch-safe disclosure with a stable focus-restoration target', () => {
    const html = renderToStaticMarkup(
      <CompactPlanNavigatorTrigger open={false} onToggle={() => {}} />,
    );

    expect(html).toContain('id="pn-compact-plan-navigator-trigger"');
    expect(html).toContain('data-pn-touch-target="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="pn-compact-plan-navigator"');
    expect(html).toContain('Open plan navigator');
    expect(html).toContain('Plan navigation');
  });

  test('announces the open state without changing the control footprint', () => {
    const closed = renderToStaticMarkup(
      <CompactPlanNavigatorTrigger open={false} onToggle={() => {}} />,
    );
    const open = renderToStaticMarkup(
      <CompactPlanNavigatorTrigger open onToggle={() => {}} />,
    );

    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('Close plan navigator');
    expect(open).toContain('h-11 w-11');
    expect(closed).toContain('h-11 w-11');
  });

  test.skipIf(!hasDom)('uses stable navigate, document identity, and Options regions on compact touch', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = domClient!.createRoot(host);
    await act!(async () => {
      root.render(
        <ThemeProvider defaultTheme="dark">
          <AppHeader
            {...headerProps}
            sticky={false}
            compactTouchLayout
            compactNavigatorAvailable
            compactNavigatorOpen={false}
            onCompactNavigatorToggle={noop}
            compactDocumentTitle="mobile-plan.md"
            compactSessionActions={[
              { id: 'feedback', label: 'Send feedback', onSelect: noop },
              { id: 'approve', label: 'Approve', onSelect: noop },
            ]}
          />
        </ThemeProvider>,
      );
    });

    const header = host.querySelector<HTMLElement>('[data-app-header="true"]')!;
    expect(header.className).toContain('grid-cols-[44px_minmax(0,1fr)_44px]');
    expect(host.querySelector('[data-pn-compact-document-title]')?.textContent).toBe('mobile-plan.md');
    expect(host.querySelector('button[aria-label="Options"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Send Feedback');
    expect(host.textContent).not.toContain('Approve');
    expect(host.textContent).not.toContain('Plannotator');
    await act!(async () => root.unmount());
    host.remove();
  });
});
