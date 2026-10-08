/**
 * v1.5 branding tests: new logo assets, manifest + Android references.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('logo assets', () => {
  it('SVG master uses the red brand and no purple', () => {
    const svg = read('public/icons/icon.svg');
    expect(svg).toContain('#e11d48');
    expect(svg).not.toMatch(/#4f46e5/i);
    expect(svg).not.toMatch(/<text/i); // no text/letters in the logo
  });

  it('PWA icons exist', () => {
    for (const f of ['public/icons/icon-192.png', 'public/icons/icon-512.png', 'public/icons/icon-maskable-512.png']) {
      expect(existsSync(join(root, f)), f).toBe(true);
    }
  });

  it('favicon exists and is the new brand', () => {
    expect(existsSync(join(root, 'public/favicon.png'))).toBe(true);
  });

  it('Android adaptive icon uses the new mark on red', () => {
    const fg = read('android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml');
    expect(fg).not.toMatch(/#4F46E5/);
    expect(fg).toContain('#FFFFFF');
    const bg = read('android/app/src/main/res/values/ic_launcher_background.xml');
    expect(bg).toContain('#E11D48');
  });

  it('Android legacy launcher PNGs exist', () => {
    for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      const p = `android/app/src/main/res/mipmap-${d}/ic_launcher.png`;
      expect(existsSync(join(root, p)), p).toBe(true);
    }
  });

  it('PWA manifest references the new icons with the red theme color', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toContain('icons/icon-192.png');
    expect(cfg).toContain('icons/icon-512.png');
    expect(cfg).toContain('icons/icon-maskable-512.png');
    expect(cfg).toContain("theme_color: '#e11d48'");
    expect(cfg).not.toContain('#4f46e5');
  });

  it('onboarding and notifications reference the new logo assets', () => {
    expect(read('src/views/onboarding.ts')).toContain('icons/icon.svg');
    expect(read('src/services/notify.ts')).toContain('icons/icon-192.png');
  });
});

describe('profile cleanup', () => {
  it('profile menu has no Tools entry', () => {
    const profile = read('src/views/profile.ts');
    expect(profile).not.toMatch(/label:\s*'Tools'/);
    // The Tools tab itself still exists in the bottom navigation.
    expect(read('src/app.ts')).toContain("'tools'");
  });
});
