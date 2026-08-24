import { afterEach, describe, expect, test } from 'bun:test';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AnnotationToolbar } from './AnnotationToolbar';
import type { QuickLabel } from '../utils/quickLabels';

const hasDom = typeof document !== 'undefined';
let root: Root | null = null;
let host: HTMLElement | null = null;
let anchor: HTMLElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  anchor?.remove();
  anchor = null;
  if (hasDom) document.body.replaceChildren();
});

function dispatchPointerClick(element: HTMLElement) {
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe.if(hasDom)('AnnotationToolbar pointer isolation', () => {
  test('a portalled PDF quick-label click is not dismissed before selection', async () => {
    let parentPointerDowns = 0;
    let selected: QuickLabel | null = null;
    const labels: QuickLabel[] = [{ id: 'anchor', emoji: '●', text: 'Anchor', color: 'red' }];

    anchor = document.createElement('span');
    document.body.appendChild(anchor);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    function Harness() {
      const [visible, setVisible] = useState(true);
      return (
        <div
          onPointerDown={() => {
            parentPointerDowns += 1;
            setVisible(false);
          }}
        >
          {visible ? (
            <AnnotationToolbar
              element={anchor!}
              positionMode="center-above"
              onAnnotate={() => {}}
              onClose={() => setVisible(false)}
              onRequestComment={() => {}}
              onQuickLabel={(label) => { selected = label; }}
              quickLabels={labels}
              showQuickApprove={false}
              commentOnly
            />
          ) : null}
        </div>
      );
    }

    await act(async () => { root?.render(<Harness />); });
    const trigger = document.querySelector<HTMLButtonElement>('button[title="Quick label"]');
    if (!trigger) throw new Error('quick-label trigger did not render');
    await act(async () => { dispatchPointerClick(trigger); });

    const labelButton = document.querySelector<HTMLButtonElement>('[data-quick-label-picker] button');
    if (!labelButton) throw new Error('quick-label picker did not render');
    await act(async () => { dispatchPointerClick(labelButton); });

    expect(parentPointerDowns).toBe(0);
    expect(selected?.text).toBe('Anchor');
  });
});
