/**
 * Categories view: manage expense/income categories — add, rename,
 * change icons, and delete custom categories.
 */
import type { Category, CategoryKind } from '../model/types';
import { newId, store } from '../data/store';
import {
  categoryAvatar, clear, confirmDialog, el, emptyState, field, openModal,
  segmented, textInput, toast,
} from '../ui/components';
import { icon } from '../ui/icons';

/** Icons users may pick for a category — all keys exist in ui/icons.ts. */
const ICON_CHOICES = [
  'food', 'transport', 'education', 'mobile', 'shopping', 'entertainment',
  'bills', 'health', 'other', 'wallet', 'scholarship', 'briefcase',
  'gift', 'income', 'coins', 'calendar', 'user', 'home',
  'chart', 'target', 'receipt', 'bell',
];

export async function renderCategories(root: HTMLElement): Promise<void> {
  clear(root);
  const view = el('div', { class: 'view' });
  root.appendChild(view);

  let tab: CategoryKind = 'expense';

  async function render(): Promise<void> {
    clear(view);

    view.appendChild(segmented<CategoryKind>(
      [
        { value: 'expense', label: 'Expense' },
        { value: 'income', label: 'Income' },
      ],
      tab,
      (v) => { tab = v; void render(); },
    ));

    const spacer = el('div', { style: 'height:12px;' });
    view.appendChild(spacer);

    const [categories, txns] = await Promise.all([
      store.listCategories(),
      store.listTransactions(),
    ]);

    const usage = new Map<string, number>();
    for (const t of txns) usage.set(t.categoryId, (usage.get(t.categoryId) ?? 0) + 1);

    const visible = categories.filter((c) => c.kind === tab || c.kind === 'both');

    if (visible.length === 0) {
      view.appendChild(emptyState({
        icon: 'other',
        title: 'No categories yet',
        subtitle: 'Add a category to organize your spending.',
        actionLabel: 'Add category',
        onAction: () => openCategoryModal(null, tab),
      }));
    } else {
      const card = el('div', { class: 'card' });
      for (const c of visible) {
        const count = usage.get(c.id) ?? 0;
        const rowEl = el('div', { class: 'set-row' },
          categoryAvatar(c),
          el('span', { class: 'lbl', text: c.name }),
          el('span', { class: 'val', text: `${count} transaction${count === 1 ? '' : 's'}` }),
          el('button', {
            class: 'icon-btn plain',
            'aria-label': `Edit ${c.name}`,
            html: icon('pencil'),
            onclick: () => openCategoryModal(c, tab),
          }),
          el('button', {
            class: 'icon-btn plain danger',
            'aria-label': `Delete ${c.name}`,
            html: icon('trash'),
            onclick: async () => {
              if (c.isDefault) {
                toast('Default categories can’t be deleted.', 'error');
                return;
              }
              const ok = await confirmDialog({
                title: `Delete "${c.name}"?`,
                message: 'Transactions in this category will show as "Unknown category".',
                confirmLabel: 'Delete',
                danger: true,
              });
              if (!ok) return;
              await store.deleteCategory(c.id);
              toast('Category deleted.', 'success');
            },
          }),
        );
        card.appendChild(rowEl);
      }
      view.appendChild(card);
    }

    view.appendChild(el('button', {
      class: 'btn btn-primary btn-block',
      html: `${icon('plus')}<span>Add category</span>`,
      onclick: () => openCategoryModal(null, tab),
    }));
  }

  function openCategoryModal(cat: Category | null, kind: CategoryKind): void {
    let chosenIcon = cat?.icon ?? 'other';
    const nameInput = textInput({
      value: cat?.name ?? '',
      placeholder: 'e.g. Snacks',
      maxlength: '30',
      autocomplete: 'off',
    });

    const grid = el('div', { class: 'cat-grid' });
    for (const iconName of ICON_CHOICES) {
      const btn = el('button', {
        type: 'button',
        class: `cat-pick${iconName === chosenIcon ? ' active' : ''}`,
        'aria-label': iconName,
        'data-icon': iconName,
        html: icon(iconName),
        onclick: () => {
          chosenIcon = iconName;
          for (const b of Array.from(grid.children)) {
            b.classList.toggle('active', (b as HTMLElement).dataset.icon === iconName);
          }
        },
      });
      grid.appendChild(btn);
    }

    const body = el('div', {}, field('Name', nameInput), field('Icon', grid));

    const handle = openModal({
      title: cat ? 'Edit category' : 'Add category',
      body,
      actions: [
        { label: 'Cancel', kind: 'ghost', onClick: () => handle.close() },
        {
          label: 'Save',
          kind: 'primary',
          onClick: async () => {
            const name = nameInput.value.trim();
            if (!name) {
              toast('Please enter a category name.', 'error');
              return;
            }
            if (cat) {
              await store.saveCategory({ ...cat, name, icon: chosenIcon });
              toast('Category updated.', 'success');
            } else {
              await store.saveCategory({
                id: newId(),
                name,
                icon: chosenIcon,
                kind,
                isDefault: false,
                createdAt: Date.now(),
              });
              toast('Category added.', 'success');
            }
            handle.close();
          },
        },
      ],
    });

    nameInput.focus({ preventScroll: true });
  }

  await render();
}
