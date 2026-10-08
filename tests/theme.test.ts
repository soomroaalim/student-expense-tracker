/**
 * v1.5 theme tests: light/dark/system, persistence, initialization.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');
const indexHtml = readFileSync(join(__dirname, '../index.html'), 'utf8');

describe('red brand tokens', () => {
  it('light mode uses the red primary', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--primary:\s*#e11d48/);
    expect(css).toMatch(/--primary-hover:\s*#[0-9a-f]{6}/);
    expect(css).toMatch(/--primary-light:\s*#[0-9a-f]{6}/);
    expect(css).toMatch(/--primary-dark:\s*#[0-9a-f]{6}/);
    expect(css).toMatch(/--background:\s*#[0-9a-f]{6}/);
    expect(css).toMatch(/--surface:\s*#[0-9a-f]{6}/);
    expect(css).toMatch(/--text-primary:\s*#[0-9a-f]{6}/);
    expect(css).toMatch(/--success:\s*#[0-9a-f]{6}/);
    expect(css).toMatch(/--warning:\s*#[0-9a-f]{6}/);
    expect(css).toMatch(/--danger:\s*#[0-9a-f]{6}/);
  });

  it('dark mode keeps a readable red primary', () => {
    expect(css).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--primary:\s*#f43f5e/);
  });

  it('no purple brand values remain in the stylesheet', () => {
    expect(css).not.toMatch(/#4f46e5/i);
    expect(css).not.toMatch(/#4338ca/i);
    expect(css).not.toMatch(/#7c3aed/i);
    expect(css).not.toMatch(/#9333ea/i);
    expect(css).not.toMatch(/#818cf8/i);
    expect(css).not.toMatch(/#8b5cf6/i);
  });

  it('index.html theme-color matches the red brand', () => {
    expect(indexHtml).toContain('content="#e11d48"');
    expect(indexHtml).not.toContain('#4f46e5');
  });
});

describe('applyTheme', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.documentElement.removeAttribute('data-theme');
  });

  it('sets light and dark explicitly', async () => {
    const { applyTheme } = await import('../src/ui/nav');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('system mode follows the OS preference', async () => {
    const { applyTheme } = await import('../src/ui/nav');
    const mm = vi.fn((q: string) => ({
      matches: q.includes('dark'),
      media: q, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    }));
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: mm });
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('theme preference persists in settings storage', async () => {
    const { getSettings, saveSettings } = await import('../src/data/store');
    saveSettings({ theme: 'dark' });
    expect(getSettings().theme).toBe('dark');
    saveSettings({ theme: 'light' });
    expect(getSettings().theme).toBe('light');
  });

  it('index.html applies the theme before first paint (no flash)', () => {
    // The inline script must read the same storage key the app uses.
    expect(indexHtml).toContain('set.settings.v1');
    expect(indexHtml).toContain("setAttribute('data-theme'");
    expect(indexHtml).toContain('prefers-color-scheme');
  });
});

describe('dark-mode contrast fixes', () => {
  it('native controls are theme-aware via color-scheme', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
    expect(css).toMatch(/\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
  });

  it('tool cards use explicit semantic text colors', () => {
    expect(css).toMatch(/\.tool-card\s*\{[^}]*color:\s*var\(--text-primary\)/);
    expect(css).toMatch(/\.tool-title\s*\{[^}]*color:\s*var\(--text-primary\)/);
    expect(css).toMatch(/\.tool-text \.txn-sub\s*\{[^}]*color:\s*var\(--text-secondary\)/);
  });

  it('game cards use explicit semantic text colors', () => {
    expect(css).toMatch(/\.game-card\s*\{[^}]*color:\s*var\(--text-primary\)/);
  });

  it('inputs have theme-aware placeholder color', () => {
    expect(css).toMatch(/\.input::placeholder\s*\{[^}]*color:\s*var\(--text-faint\)/);
  });

  it('no hard-coded black text colors anywhere', () => {
    expect(css).not.toMatch(/color:\s*black\b/i);
    expect(css).not.toMatch(/color:\s*#000\b/i);
    expect(css).not.toMatch(/color:\s*#000000/i);
  });

  it('white text only appears on colored surfaces', () => {
    const lines = css.split('\n');
    lines.forEach((line, i) => {
      if (/color:\s*#(fff|ffffff)\b/i.test(line) && !/background/i.test(lines.slice(Math.max(0, i - 3), i + 1).join(' '))) {
        // White text must be near a background declaration (button/hero/toast).
        const ctx = lines.slice(Math.max(0, i - 5), i + 1).join(' ');
        expect(ctx).toMatch(/background/i);
      }
    });
  });
});
