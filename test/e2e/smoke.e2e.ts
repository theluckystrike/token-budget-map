import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { pluginId, reloadPlugin } from './load';

const words = (n: number, tag: string): string => Array.from({ length: n }, (_, i) => `${tag} word ${i}.`).join(' ');

/** Turns Pro on or off in memory only (QA entitlement). A plugin reload turns it off again. */
async function setPro(on: boolean): Promise<void> {
	await browser.executeObsidian(({ app }, id, value) => {
		interface Pro {
			isPro(): boolean;
			listeners: Iterable<() => void>;
		}
		const p = (app as unknown as { plugins: { plugins: Record<string, { pro: Pro; __qaIsPro?: () => boolean }> } }).plugins.plugins[id]!;
		if (value && !p.__qaIsPro) {
			p.__qaIsPro = p.pro.isPro;
			p.pro.isPro = () => true;
		} else if (!value && p.__qaIsPro) {
			p.pro.isPro = p.__qaIsPro;
			delete p.__qaIsPro;
		}
		for (const l of [...p.pro.listeners]) l();
	}, pluginId, on);
}

describe(`${pluginId} smoke test`, function () {
	before(async function () {
		await obsidianPage.write('Docs/Guide.md', `# Guide\n\n${words(300, 'guide')}\n`);
		await obsidianPage.write('Docs/Deep/Spec.md', `# Spec\n\n${words(120, 'spec')}\n`);
		await obsidianPage.write('Log/Day.md', '# Day\n\nShort entry.\n');
	});

	afterEach(async function () {
		await setPro(false);
	});

	it('is enabled and reloads with no console errors', async function () {
		const state = await reloadPlugin(pluginId);
		expect(state).toEqual({ enabled: true, reloaded: true, errors: [] });
	});

	it('shows the tokens of the note and of the selection in the status bar', async function () {
		await obsidianPage.openFile('Docs/Guide.md');
		const text = await browser.executeObsidian(async ({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			if (!editor) return 'no editor';
			editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 7 });
			await new Promise((r) => setTimeout(r, 600));
			return document.querySelector('.tbm-statusbar')?.textContent ?? '';
		});
		expect(text).toMatch(/^≈[0-9,]+ tokens, ≈[0-9,]+ selected$/);
	});

	it('shows the Pro text and no rows in the token map for a free user', async function () {
		const state = await browser.executeObsidian(async ({ app }, id) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, { openMap(): Promise<void> }> } }).plugins.plugins[id]!;
			app.workspace.detachLeavesOfType(id);
			await p.openMap();
			await new Promise((r) => setTimeout(r, 400));
			const leaf = app.workspace.getLeavesOfType(id)[0];
			const el = leaf?.view.containerEl;
			return { attached: !!el && leaf.containerEl.contains(el), text: el?.textContent ?? '', rows: el?.querySelectorAll('.tbm-row').length ?? -1 };
		}, pluginId);
		expect(state.attached).toBe(true);
		expect(state.text).toContain('It is a Pro feature.');
		expect(state.rows).toBe(0);
	});

	it('attaches the token map to its leaf and lists folders with their share of the window', async function () {
		await setPro(true);
		const state = await browser.executeObsidian(async ({ app }, id) => {
			interface Plugin {
				openMap(): Promise<void>;
				refreshMap(): Promise<unknown>;
			}
			const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins[id]!;
			app.workspace.detachLeavesOfType(id);
			await p.openMap();
			await p.refreshMap();
			await new Promise((r) => setTimeout(r, 400));
			const leaf = app.workspace.getLeavesOfType(id)[0]!;
			const view = leaf.view as unknown as { containerEl: HTMLElement; openFolder(path: string): void };
			view.openFolder('Docs');
			const shown = view.containerEl.isConnected && leaf.containerEl.contains(view.containerEl) && view.containerEl.offsetWidth > 0;
			const rows = [...view.containerEl.querySelectorAll('.tbm-row')].map((r) => r.textContent ?? '');
			const crumbs = view.containerEl.querySelector('.tbm-crumbs')?.textContent ?? '';
			return { shown, rows, crumbs };
		}, pluginId);
		expect(state.shown).toBe(true);
		expect(state.crumbs).toBe('Vault / Docs');
		expect(state.rows).toHaveLength(2);
		expect(state.rows[0]).toMatch(/^Guide[0-9,]+([0-9]+ %|under 1 %)$/);
		expect(state.rows[1]).toMatch(/^Deep\/[0-9,]+([0-9]+ %|under 1 %)$/);
	});

	it('writes the fit report as a note with a row for the vault', async function () {
		await setPro(true);
		const text = await browser.executeObsidian(async ({ app }, id) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, { exportReport(): Promise<string | null> }> } }).plugins.plugins[id]!;
			const path = await p.exportReport();
			if (!path) return 'no report';
			const t = await app.vault.adapter.read(path);
			const f = app.vault.getAbstractFileByPath(path);
			if (f) await app.vault.delete(f);
			return t;
		}, pluginId);
		expect(text).toContain('# Token budget report');
		expect(text).toMatch(/\| Whole vault \| [0-9]+ \| [0-9,]+ \| fits/);
		expect(text).toContain('| Docs |');
	});
});
