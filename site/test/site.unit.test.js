// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('site/nav.js', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.resetModules();
    });

    it('injects one link per puzzle and highlights the current page', async () => {
        const { initNav, PUZZLES } = await import('../nav.js');
        document.getElementById('site-nav')?.remove();
        const nav = initNav('/valkey-maze/rikudo/');
        expect(nav.querySelectorAll('a').length).toBe(PUZZLES.length);
        expect(nav.querySelector('.nav-current').textContent).toBe('Rikudo');
        expect(nav.querySelector('.nav-current').getAttribute('aria-current')).toBe('page');
    });

    it('is idempotent', async () => {
        const { initNav } = await import('../nav.js');
        initNav('/game/');
        initNav('/game/');
        expect(document.querySelectorAll('#site-nav').length).toBe(1);
    });

    it('uses relative hrefs (GitHub Pages project-site safe)', async () => {
        const { initNav } = await import('../nav.js');
        document.getElementById('site-nav')?.remove();
        const nav = initNav('/game/');
        for (const a of nav.querySelectorAll('a')) {
            expect(a.getAttribute('href')).toMatch(/^\.\.\//);
        }
    });
});

describe('site/about.js', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.resetModules();
    });

    it('injects the about panel with the Valkey link', async () => {
        await import('../about.js');
        const panel = document.getElementById('about-panel');
        expect(panel).not.toBeNull();
        expect(panel.querySelector('a.about-trigger').href).toContain('valkey.io');
        expect(panel.textContent).toContain('Check out Valkey!');
    });

    it('is idempotent', async () => {
        const { initAbout } = await import('../about.js');
        initAbout();
        initAbout();
        expect(document.querySelectorAll('#about-panel').length).toBe(1);
    });
});
