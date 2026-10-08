/**
 * Shared UI primitives: DOM helpers, toasts, modals, confirm dialogs,
 * empty states, progress bars, and money/category presentation helpers.
 */
import { CATEGORY_COLORS } from '../model/defaults';
import type { Category } from '../model/types';
import { getSettings } from '../data/store';
import { formatMoney } from '../core/money';
import { icon } from './icons';

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined | null>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<Node | string | number | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (typeof v === 'boolean') {
      if (v) node.setAttribute(k, '');
    } else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Clear all children of a node. */
export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

// ------------------------------------------------------------------ toasts

let toastRoot: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  if (!toastRoot) {
    toastRoot = el('div', { class: 'toast-root', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastRoot);
  }
  const t = el('div', { class: `toast toast-${kind}` });
  const ic = el('span', { class: 'toast-ic', html: icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info') });
  t.append(ic, el('span', { class: 'toast-msg' }, message));
  toastRoot.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

// ------------------------------------------------------------------ modals

export interface ModalHandle {
  close: () => void;
  root: HTMLElement;
}

/** Stack of currently open modals (topmost last). Used by Android back-button handling. */
const modalStack: ModalHandle[] = [];

/** True when at least one modal/dialog is open. */
export function hasOpenModal(): boolean {
  return modalStack.length > 0;
}

/** Close the topmost open modal, if any. Returns true when one was closed. */
export function closeTopModal(): boolean {
  const top = modalStack[modalStack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function openModal(opts: {
  title: string;
  body: HTMLElement | string;
  actions?: Array<{ label: string; kind?: 'primary' | 'danger' | 'ghost'; onClick?: () => void | Promise<void> }>;
  dismissible?: boolean;
}): ModalHandle {
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  const header = el('div', { class: 'modal-header' },
    el('h2', { class: 'modal-title', text: opts.title }),
    el('button', {
      class: 'icon-btn', 'aria-label': 'Close',
      html: icon('x'),
      onclick: () => handle.close(),
    }),
  );
  const body = el('div', { class: 'modal-body' });
  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else body.appendChild(opts.body);
  dialog.append(header, body);
  if (opts.actions?.length) {
    const footer = el('div', { class: 'modal-actions' });
    for (const a of opts.actions) {
      footer.appendChild(el('button', {
        class: `btn btn-${a.kind ?? 'ghost'}`,
        text: a.label,
        onclick: async () => {
          try { await a.onClick?.(); } finally { /* keep open unless action closes */ }
        },
      }));
    }
    dialog.appendChild(footer);
  }
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const handle: ModalHandle = {
    root: overlay,
    close: () => {
      const idx = modalStack.indexOf(handle);
      if (idx >= 0) modalStack.splice(idx, 1);
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKey);
    },
  };
  modalStack.push(handle);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.dismissible !== false) handle.close();
  };
  document.addEventListener('keydown', onKey);
  if (opts.dismissible !== false) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) handle.close();
    });
  }
  return handle;
}

/** Confirmation dialog. Resolves true when the user confirms. */
export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      handle.close();
      resolve(v);
    };
    const handle = openModal({
      title: opts.title,
      body: el('p', { class: 'confirm-msg', text: opts.message }),
      dismissible: true,
      actions: [
        { label: 'Cancel', kind: 'ghost', onClick: () => finish(false) },
        {
          label: opts.confirmLabel ?? 'Delete',
          kind: opts.danger === false ? 'primary' : 'danger',
          onClick: () => finish(true),
        },
      ],
    });
  });
}

// ------------------------------------------------------------------ widgets

export function emptyState(opts: {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}): HTMLElement {
  const wrap = el('div', { class: 'empty' });
  wrap.append(
    el('div', { class: 'empty-icon', html: icon(opts.icon) }),
    el('h3', { class: 'empty-title', text: opts.title }),
  );
  if (opts.subtitle) wrap.appendChild(el('p', { class: 'empty-sub', text: opts.subtitle }));
  if (opts.actionLabel && opts.onAction) {
    wrap.appendChild(el('button', { class: 'btn btn-primary', text: opts.actionLabel, onclick: opts.onAction }));
  }
  return wrap;
}

export function progressBar(pct: number, cls = ''): HTMLElement {
  const clamped = Math.max(0, Math.min(1, pct));
  const bar = el('div', { class: `pbar ${cls}` });
  const fill = el('div', { class: 'pbar-fill' });
  fill.style.width = `${clamped * 100}%`;
  if (clamped >= 1) fill.classList.add('full');
  else if (clamped >= 0.8) fill.classList.add('warn');
  bar.appendChild(fill);
  return bar;
}

/** Money amount formatted in the user's currency. */
export function moneyEl(minor: number, cls = ''): HTMLElement {
  return el('span', { class: `money ${cls}`, text: formatMoney(minor, getSettings().currency) });
}

/** Colored circle avatar for a category. */
export function categoryAvatar(cat: Category | undefined, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  const idx = cat ? Math.abs(hashStr(cat.id)) % CATEGORY_COLORS.length : 0;
  const color = CATEGORY_COLORS[idx];
  const wrap = el('div', { class: `cat-avatar avatar-${size}`, html: icon(cat?.icon ?? 'other') });
  wrap.style.setProperty('--cat-color', color);
  return wrap;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Segmented control (e.g. Expense | Income tabs). Manages its own active state. */
export function segmented<T extends string>(options: Array<{ value: T; label: string }>, current: T, onChange: (v: T) => void): HTMLElement {
  const wrap = el('div', { class: 'segmented', role: 'tablist' });
  const buttons: HTMLButtonElement[] = [];
  for (const o of options) {
    const btn = el('button', {
      class: `seg-btn${o.value === current ? ' active' : ''}`,
      role: 'tab',
      'aria-selected': o.value === current ? 'true' : 'false',
      text: o.label,
      type: 'button',
      onclick: () => {
        for (const b of buttons) {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
        onChange(o.value);
      },
    }) as HTMLButtonElement;
    buttons.push(btn);
    wrap.appendChild(btn);
  }
  return wrap;
}

/** Simple form field wrapper. */
export function field(label: string, input: HTMLElement, opts: { error?: string } = {}): HTMLElement {
  const wrap = el('label', { class: 'field' });
  wrap.append(el('span', { class: 'field-label', text: label }), input);
  if (opts.error) wrap.appendChild(el('span', { class: 'field-error', text: opts.error }));
  return wrap;
}

export function textInput(attrs: Attrs = {}): HTMLInputElement {
  return el('input', { class: 'input', ...attrs });
}

export function selectInput(options: Array<{ value: string; label: string }>, selected: string, attrs: Attrs = {}): HTMLSelectElement {
  const s = el('select', { class: 'input', ...attrs });
  for (const o of options) {
    const opt = el('option', { value: o.value, text: o.label });
    if (o.value === selected) opt.selected = true;
    s.appendChild(opt);
  }
  return s;
}

/**
 * Shrink-to-fit for money amounts: reduces the font size of `.fit-amt`
 * elements until the full amount fits on one line (never clipped with "...").
 * Falls back to CSS word-breaking when layout info is unavailable (e.g. tests).
 */
export function fitAmounts(root: ParentNode, selector = '.fit-amt', minPx = 10): void {
  const els = root.querySelectorAll(selector);
  els.forEach((node) => {
    const e = node as HTMLElement;
    e.style.fontSize = '';
    let size = parseFloat(getComputedStyle(e).fontSize);
    if (!Number.isFinite(size) || size <= 0) return;
    let guard = 40;
    while (guard-- > 0 && size > minPx && e.scrollWidth > e.clientWidth + 1) {
      size -= 1;
      e.style.fontSize = `${size}px`;
    }
  });
}
