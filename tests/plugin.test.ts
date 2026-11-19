import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian-test-mocks/obsidian';
import TokenBudgetMapPlugin, { REPORT_FOLDERS, countAccuracy, statusText } from '../src/main';
import { DEFAULT_SETTINGS } from '../src/settings';
import { SPONSORS, bindPro, resetPro } from '../src/pro';
import { MAX_ROWS, TokenMapView, VIEW_TYPE } from '../src/view';
import { estimateTokens } from '../src/estimate';
import manifest from '../manifest.json';

type Listener = () => void;
function fakePro(on: boolean): { set(v: boolean): void } {
	let state = on;
	const listeners = new Set<Listener>();
	bindPro({
		config: SPONSORS,
		isConfigured: () => true,
		hasToken: () => false,
		getState: () => ({ status: 'signed-out' }),
		isPro: () => state,
		onChange: (cb: Listener) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
	} as never);
	return {
		set(v: boolean) {
			state = v;
			for (const cb of [...listeners]) cb();
		},
	};
}

const FILES: Record<string, string> = {
	'Projects/Alpha/plan.md': 'Plan for alpha with several words.\n'.repeat(40),
	'Projects/Alpha/notes.md': 'Short note.',
	'Projects/Beta.md': 'Beta text here.\n'.repeat(10),
	'Templates/daily.md': 'Template words.\n'.repeat(100),
	'Inbox.md': 'Inbox item.',
	'image.png': 'binary',
};

async function setup(files: Record<string, string> = FILES, data?: unknown) {
	const app = App.createConfigured__({ files });
	const plugin = new TokenBudgetMapPlugin(app as never, manifest as never);
	if (data !== undefined) (plugin as unknown as { data__: unknown }).data__ = data;
	await plugin.loadSettings();
	return { app, plugin };
}

function setEditor(app: App, value: string, selection = ''): void {
	(app.workspace as unknown as { activeEditor: unknown }).activeEditor = { editor: { getValue: () => value, getSelection: () => selection } };
}

afterEach(() => {
	resetPro();
	vi.restoreAllMocks();
});

describe('status bar (free)', () => {
	it('loads with default settings', async () => {
		const { plugin } = await setup();
		expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
	});
	it('marks every count as an estimate and adds the selection', () => {
		expect(statusText({ note: 1234, selection: 0 }, true)).toBe('≈1,234 tokens');
		expect(statusText({ note: 1234, selection: 56 }, true)).toBe('≈1,234 tokens, ≈56 selected');
		expect(statusText({ note: 1234, selection: 56 }, false)).toBe('≈1,234 tokens');
		expect(statusText(null, true)).toBe('');
		expect(statusText({ note: 10, selection: 0, rough: ['emoji'] }, true)).toBe('≈10 tokens (rough)');
		expect(countAccuracy({ note: 10, selection: 0, rough: ['emoji', 'link'] })).toBe(
			'This is a rough estimate. In our test, notes with emoji were between 38 % under and 8 % under, and notes with many links were between 4 % under and 11 % over.',
		);
		expect(countAccuracy({ note: 10, selection: 0, rough: [] })).toBe('This is an estimate. In our test, notes with plain prose were between 3 % under and 9 % over.');
		expect(countAccuracy(null)).not.toContain('about 4 %');
	});
	it('counts the live editor text and the selection', async () => {
		const { app, plugin } = await setup();
		setEditor(app, 'Hello world.', 'Hello');
		expect(plugin.currentCount()).toEqual({ note: 3, selection: 1, rough: [] });
		plugin.settings.selection = false;
		expect(plugin.currentCount()).toEqual({ note: 3, selection: 0, rough: [] });
	});
	it('shows nothing with no editor', async () => {
		const { plugin } = await setup();
		expect(plugin.currentCount()).toBeNull();
	});
	it('writes the status bar after load, and hides it when turned off', async () => {
		const { app, plugin } = await setup();
		await plugin.onload();
		setEditor(app, 'Hello world.', 'Hello');
		plugin.updateStatus();
		const el = (plugin as unknown as { statusEl: HTMLElement }).statusEl;
		expect(el.getText()).toBe('≈3 tokens, ≈1 selected');
		plugin.settings.statusBar = false;
		plugin.updateStatus();
		expect(el.getText()).toBe('');
		expect(el.hasClass('tbm-hidden')).toBe(true);
		plugin.onunload();
	});
});

describe('Pro gate', () => {
	it('the map, the refresh command and the report do nothing for a free user', async () => {
		const { app, plugin } = await setup();
		await plugin.onload();
		fakePro(false);
		const create = vi.spyOn(app.vault, 'create');
		expect(await plugin.refreshMap(true)).toBeNull();
		expect(await plugin.exportReport()).toBeNull();
		expect(plugin.index.entries.size).toBe(0);
		expect(create).not.toHaveBeenCalled();
		plugin.onunload();
	});
	it('the report stays Pro only after Pro turns off, even with a finished count', async () => {
		const { app, plugin } = await setup();
		await plugin.onload();
		const pro = fakePro(true);
		await plugin.refreshMap();
		pro.set(false);
		const create = vi.spyOn(app.vault, 'create');
		expect(await plugin.exportReport()).toBeNull();
		expect(create).not.toHaveBeenCalled();
		plugin.onunload();
	});
	it('the view shows the free text and no counts for a free user', async () => {
		const { plugin } = await setup();
		await plugin.onload();
		fakePro(false);
		await plugin.openMap();
		const view = plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0]!.view as TokenMapView;
		expect(view.contentEl.getText()).toContain('Pro feature');
		expect(view.contentEl.querySelector('.tbm-row')).toBeNull();
		plugin.onunload();
	});
});

describe('token map (Pro)', () => {
	it('counts Markdown notes only, skips folders and sums folders', async () => {
		const { plugin } = await setup(FILES, { skipFolders: 'Templates' });
		await plugin.onload();
		fakePro(true);
		const s = await plugin.refreshMap();
		expect(s).toMatchObject({ files: 4, read: 4, complete: true });
		const tree = plugin.tree();
		const alpha = estimateTokens(FILES['Projects/Alpha/plan.md']!) + estimateTokens(FILES['Projects/Alpha/notes.md']!);
		expect(tree.get('Projects/Alpha')!.tokens).toBe(alpha);
		expect(tree.get('Projects')!.tokens).toBe(alpha + estimateTokens(FILES['Projects/Beta.md']!));
		expect(tree.has('Templates')).toBe(false);
		const again = await plugin.refreshMap();
		expect(again).toMatchObject({ read: 0, cached: 4 });
		plugin.onunload();
	});
	it('updates the cache on delete and rename', async () => {
		const { app, plugin } = await setup();
		await plugin.onload();
		fakePro(true);
		await plugin.refreshMap();
		const file = app.vault.getAbstractFileByPath('Inbox.md') as TFile;
		await app.vault.rename(file, 'Archive/Inbox.md');
		expect(plugin.index.entries.has('Archive/Inbox.md')).toBe(true);
		expect(plugin.index.entries.has('Inbox.md')).toBe(false);
		await app.vault.delete(app.vault.getAbstractFileByPath('Projects/Beta.md') as TFile);
		expect(plugin.index.entries.has('Projects/Beta.md')).toBe(false);
		expect(plugin.tree().get('Projects')!.notes).toBe(2);
		plugin.onunload();
	});
	it('a rename to a name that is not Markdown drops the note from the map at once', async () => {
		const { app, plugin } = await setup();
		await plugin.onload();
		fakePro(true);
		await plugin.refreshMap();
		expect(plugin.tree().get('')!.notes).toBe(5);
		await app.vault.rename(app.vault.getAbstractFileByPath('Inbox.md') as TFile, 'Inbox.txt');
		expect(plugin.index.entries.has('Inbox.txt')).toBe(false);
		expect(plugin.index.entries.has('Inbox.md')).toBe(false);
		expect(plugin.tree().get('')!.notes).toBe(4);
		plugin.onunload();
	});
	it('the status bar marks a note with many emoji', async () => {
		const { app, plugin } = await setup();
		await plugin.onload();
		setEditor(app, 'Day log 😀😀😀😀😀😀');
		plugin.updateStatus();
		const el = (plugin as unknown as { statusEl: HTMLElement }).statusEl;
		expect(el.getText()).toMatch(/\(rough\)$/);
		expect(el.getAttr('aria-label')).toContain('notes with emoji were between 38 % under');
		plugin.onunload();
	});
	it('the view lists the largest item first and marks what does not fit', async () => {
		const { plugin } = await setup(FILES, { windowsText: 'Tiny = 100\nBig = 1M', activeWindow: 'Tiny', reserve: 0 });
		await plugin.onload();
		fakePro(true);
		await plugin.openMap();
		await plugin.refreshMap();
		const view = plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0]!.view as TokenMapView;
		const names = [...view.contentEl.querySelectorAll('.tbm-row .tbm-name')].map((e) => e.textContent);
		expect(names[0]).toBe('Templates/');
		expect(names).toContain('Inbox');
		expect(view.contentEl.querySelector('.tbm-total .tbm-over')?.textContent).toContain('Does not fit Tiny');
		expect(view.contentEl.querySelectorAll('.tbm-over').length).toBeGreaterThan(0);
		view.openFolder('Projects');
		const inner = [...view.contentEl.querySelectorAll('.tbm-row .tbm-name')].map((e) => e.textContent);
		expect(inner).toEqual(['Alpha/', 'Beta']);
		expect(view.contentEl.getText()).toContain('estimates');
		plugin.onunload();
	});
	it('the view caps the rows of one folder', async () => {
		const many: Record<string, string> = {};
		for (let i = 0; i < MAX_ROWS + 20; i++) many[`n${i}.md`] = `note ${i}`;
		const { plugin } = await setup(many);
		await plugin.onload();
		fakePro(true);
		await plugin.openMap();
		await plugin.refreshMap();
		const view = plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0]!.view as TokenMapView;
		expect(view.contentEl.querySelectorAll('.tbm-row').length).toBe(MAX_ROWS);
		expect(view.contentEl.querySelector('.tbm-more')?.textContent).toContain('20 smaller items');
		plugin.onunload();
	});
	it('falls back to the first window when the saved one is gone', async () => {
		const { plugin } = await setup(FILES, { windowsText: 'A = 1k\nB = 2k', activeWindow: 'Gone' });
		expect(plugin.currentWindow()?.name).toBe('A');
		await plugin.setActiveWindow('B');
		expect(plugin.currentWindow()?.name).toBe('B');
	});
});

describe('fit report (Pro)', () => {
	it('writes a new note with the vault row first and one cell per window', async () => {
		const { app, plugin } = await setup(FILES, { windowsText: 'Tiny = 100\nBig = 1M', reserve: 0 });
		await plugin.onload();
		fakePro(true);
		const path = await plugin.exportReport(new Date(2026, 10, 19, 21, 5));
		expect(path).toBe('Token budget report 2026-11-19 2105.md');
		const text = await app.vault.read(app.vault.getAbstractFileByPath(path!) as TFile);
		const rows = text.split('\n').filter((l) => l.startsWith('| '));
		expect(rows[0]).toBe('| Content | Notes | Tokens | Tiny (100) | Big (1,000,000) |');
		expect(rows[2]).toMatch(/^\| Whole vault \| 5 \| [\d,]+ \| does not fit \(\d+ %\) \| fits \(under 1 %\) \|$/);
		const second = await plugin.exportReport(new Date(2026, 10, 19, 21, 5));
		expect(second).toBe('Token budget report 2026-11-19 2105 2.md');
		plugin.onunload();
	});
	it('lists at most the largest REPORT_FOLDERS folders', async () => {
		const many: Record<string, string> = {};
		for (let i = 0; i < REPORT_FOLDERS + 5; i++) many[`f${i}/n.md`] = 'word '.repeat(i + 1);
		const { plugin } = await setup(many);
		await plugin.onload();
		fakePro(true);
		await plugin.refreshMap();
		const items = plugin.reportItems();
		expect(items.length).toBe(REPORT_FOLDERS + 1);
		expect(items[0]!.label).toBe('Whole vault');
		expect(items[1]!.label).toBe(`f${REPORT_FOLDERS + 4}`);
		plugin.onunload();
	});
});

describe('unload', () => {
	it('cancels a pending rescan, so no count runs after unload', async () => {
		vi.useFakeTimers();
		try {
			const { app, plugin } = await setup();
			await plugin.onload();
			fakePro(true);
			vi.spyOn(plugin, 'mapOpen').mockReturnValue(true);
			const spy = vi.spyOn(plugin, 'refreshMap');
			await app.vault.modify(app.vault.getAbstractFileByPath('Inbox.md') as TFile, 'changed text');
			plugin.onunload();
			await vi.advanceTimersByTimeAsync(5000);
			expect(spy).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
	it('clears the cache and stops work', async () => {
		const { plugin } = await setup();
		await plugin.onload();
		fakePro(true);
		await plugin.refreshMap();
		expect(plugin.index.entries.size).toBeGreaterThan(0);
		plugin.onunload();
		expect(plugin.index.entries.size).toBe(0);
		expect(await plugin.refreshMap()).toBeNull();
	});
});
