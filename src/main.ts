import { Notice, Plugin, TFile, TFolder, debounce, normalizePath, type TAbstractFile } from 'obsidian';
import type { SponsorsManager } from './license/index';
import { createGitHubSponsors } from './license/github-obsidian';
import { SPONSORS, bindPro, isPro, onProChange, proNotice, resetPro } from './pro';
import { DEFAULT_SETTINGS, TokenBudgetMapSettingTab, isSkipped, normalizeSettings, skipList, type TokenBudgetMapSettings } from './settings';
import { estimateTokens, formatTokens } from './estimate';
import { accuracyText, noteClasses, type NoteClass } from './accuracy';
import { TokenIndex, buildTree, folderRows, type FileRef, type FolderNode, type ScanStats } from './scan';
import { parseWindows, reportMarkdown, type ContextWindow, type ReportItem } from './budget';
import { TokenMapView, VIEW_TYPE } from './view';

const PRO_TICK_MS = 6 * 60 * 60 * 1000;
/** Folders in the report at most. */
export const REPORT_FOLDERS = 200;

export interface StatusCount {
	note: number;
	selection: number;
	/** Kinds of content in the note that make the estimate less exact. */
	rough?: NoteClass[];
}

/** The status bar text. Every count is marked as an estimate with the approximately sign.
 * A note with content that makes the estimate less exact is marked as rough. */
export function statusText(c: StatusCount | null, showSelection: boolean): string {
	if (!c) return '';
	const rough = c.rough?.length ? ' (rough)' : '';
	const base = `≈${formatTokens(c.note)} tokens${rough}`;
	return showSelection && c.selection > 0 ? `${base}, ≈${formatTokens(c.selection)} selected` : base;
}

/** The accuracy sentence for the tooltip and the notice, with the measured range of each kind of note. */
export function countAccuracy(c: StatusCount | null): string {
	return accuracyText(c?.rough ?? []);
}

export default class TokenBudgetMapPlugin extends Plugin {
	settings: TokenBudgetMapSettings = { ...DEFAULT_SETTINGS };
	pro: SponsorsManager | null = null;
	readonly index = new TokenIndex();
	scanning = false;
	lastScan: ScanStats | null = null;
	private treeCache: Map<string, FolderNode> | null = null;
	private statusEl: HTMLElement | null = null;
	private settingTab: TokenBudgetMapSettingTab | null = null;
	private disposed = false;
	private rescanQueued = false;
	private readonly scheduleStatus = debounce(() => this.updateStatus(), 250, true);
	private readonly scheduleRescan = debounce(() => void this.refreshMap(), 2000, true);

	async onload(): Promise<void> {
		this.disposed = false;
		await this.loadSettings();
		const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this);
		pro.init();
		this.pro = pro;
		bindPro(pro);
		this.settingTab = new TokenBudgetMapSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);
		this.register(
			onProChange(() => {
				this.settingTab?.update();
				this.redrawViews();
				if (isPro() && this.mapOpen() && !this.lastScan) void this.refreshMap();
			}),
		);

		this.registerView(VIEW_TYPE, (leaf) => new TokenMapView(leaf, this));
		this.statusEl = this.addStatusBarItem();
		this.statusEl.addClass('tbm-statusbar');
		this.statusEl.setAttr('aria-label', 'Estimated tokens. Select to open the token map.');
		this.registerDomEvent(this.statusEl, 'click', () => void this.openMap());

		this.addCommand({ id: 'open-map', name: 'Open the token map', callback: () => void this.openMap() });
		this.addCommand({ id: 'refresh-map', name: 'Count the vault again', callback: () => void this.refreshMap(true) });
		this.addCommand({ id: 'export-report', name: 'Export the fit report', callback: () => void this.exportReport() });
		this.addCommand({
			id: 'show-count',
			name: 'Show the token count of the current note',
			checkCallback: (checking) => {
				const c = this.currentCount();
				if (!c) return false;
				if (!checking) new Notice(`${statusText(c, true)}. ${countAccuracy(c)}`);
				return true;
			},
		});

		this.registerEvent(this.app.workspace.on('editor-change', () => this.scheduleStatus()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scheduleStatus()));
		this.registerEvent(this.app.workspace.on('file-open', () => this.scheduleStatus()));
		// Selection changes fire on the document of each window. Popout windows get their own listener.
		const onSelection = (): void => {
			if (this.settings.selection) this.scheduleStatus();
		};
		this.registerDomEvent(activeDocument, 'selectionchange', onSelection);
		this.registerEvent(this.app.workspace.on('window-open', (_w, win) => this.registerDomEvent(win.document, 'selectionchange', onSelection)));

		this.registerEvent(this.app.vault.on('modify', (f) => this.onVaultChange(f)));
		this.registerEvent(this.app.vault.on('create', (f) => this.onVaultChange(f)));
		this.registerEvent(
			this.app.vault.on('delete', (f) => {
				this.index.remove(f.path, f instanceof TFolder);
				this.treeCache = null;
				this.onVaultChange(f);
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (f, oldPath) => {
				if (f instanceof TFolder) this.index.rename(oldPath, f.path, true);
				else if (f instanceof TFile && f.extension !== 'md') this.index.remove(oldPath);
				else this.index.rename(oldPath, f.path);
				this.treeCache = null;
				this.onVaultChange(f);
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			if (this.disposed) return;
			this.updateStatus();
			void pro.refresh();
			this.registerInterval(window.setInterval(() => void pro.refresh(), PRO_TICK_MS));
		});
	}

	onunload(): void {
		this.disposed = true;
		this.scheduleStatus.cancel();
		this.scheduleRescan.cancel();
		this.index.clear();
		this.treeCache = null;
		resetPro();
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings((await this.loadData()) as Partial<TokenBudgetMapSettings> | null);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	onSettingsChanged(): void {
		this.updateStatus();
		this.treeCache = null;
		this.redrawViews();
		// A changed skip list changes which notes the map holds.
		if (isPro() && this.mapOpen()) this.scheduleRescan();
	}

	// Status bar (free)

	/** Counts of the active editor, from its live text (unsaved changes count too). */
	currentCount(): StatusCount | null {
		const editor = this.app.workspace.activeEditor?.editor;
		if (!editor) return null;
		const sel = this.settings.selection ? editor.getSelection() : '';
		const text = editor.getValue();
		return { note: estimateTokens(text), selection: sel ? estimateTokens(sel) : 0, rough: noteClasses(text) };
	}

	updateStatus(): void {
		if (!this.statusEl || this.disposed) return;
		const c = this.settings.statusBar ? this.currentCount() : null;
		const text = c ? statusText(c, this.settings.selection) : '';
		this.statusEl.setText(text);
		this.statusEl.setAttr('aria-label', `${countAccuracy(c)} Select to open the token map.`);
		this.statusEl.toggleClass('tbm-hidden', text === '');
	}

	// Token map (Pro)

	windows(): ContextWindow[] {
		return parseWindows(this.settings.windowsText).windows;
	}

	currentWindow(windows = this.windows()): ContextWindow | null {
		return windows.find((w) => w.name === this.settings.activeWindow) ?? windows[0] ?? null;
	}

	async setActiveWindow(name: string): Promise<void> {
		this.settings.activeWindow = name;
		await this.saveSettings();
		this.redrawViews();
	}

	/** Markdown files that the map counts, without the skipped folders. */
	files(): FileRef[] {
		const skip = skipList(this.settings.skipFolders);
		const out: FileRef[] = [];
		for (const f of this.app.vault.getMarkdownFiles()) {
			if (skip.length && isSkipped(f.path, skip)) continue;
			out.push({ path: f.path, mtime: f.stat.mtime, size: f.stat.size });
		}
		return out;
	}

	tree(): Map<string, FolderNode> {
		if (!this.treeCache) {
			const skip = skipList(this.settings.skipFolders);
			const entries = skip.length ? [...this.index.entries].filter(([p]) => !isSkipped(p, skip)) : this.index.entries;
			this.treeCache = buildTree(entries);
		}
		return this.treeCache;
	}

	statusLine(): string {
		if (this.scanning) return 'Counting.';
		const s = this.lastScan;
		if (!s) return 'Not counted yet.';
		const secs = (s.ms / 1000).toFixed(1);
		const failed = s.failed ? ` ${formatTokens(s.failed)} notes could not be read.` : '';
		return `Counted ${formatTokens(s.files)} notes in ${secs} s, ${formatTokens(s.cached)} from the cache. All counts are estimates. Fits includes the measured margin of each kind of note.${failed}`;
	}

	/** Counts the vault. Unchanged notes come from the cache. Returns null when Pro is off or a scan runs. */
	async refreshMap(fromCommand = false): Promise<ScanStats | null> {
		if (this.disposed) return null;
		if (!isPro()) {
			if (fromCommand) proNotice('The token map is a Pro feature.');
			return null;
		}
		if (this.scanning) {
			this.rescanQueued = true;
			return null;
		}
		this.scanning = true;
		this.redrawViews();
		try {
			const vault = this.app.vault;
			const read = async (path: string): Promise<string> => {
				const f = vault.getAbstractFileByPath(path);
				if (!(f instanceof TFile)) throw new Error('gone');
				return vault.cachedRead(f);
			};
			const stats = await this.index.scan(this.files(), read, { cancelled: () => this.disposed });
			if (stats.complete) this.lastScan = stats;
			this.treeCache = null;
			return stats;
		} finally {
			this.scanning = false;
			if (!this.disposed) {
				this.redrawViews();
				if (this.rescanQueued) {
					this.rescanQueued = false;
					this.scheduleRescan();
				}
			}
		}
	}

	private onVaultChange(f: TAbstractFile): void {
		if (f instanceof TFile && f.extension !== 'md') return;
		if (isPro() && this.mapOpen()) this.scheduleRescan();
	}

	mapOpen(): boolean {
		return this.app.workspace.getLeavesOfType(VIEW_TYPE).length > 0;
	}

	redrawViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof TokenMapView) view.render();
		}
	}

	async openMap(): Promise<void> {
		const leaf = await this.app.workspace.ensureSideLeaf(VIEW_TYPE, 'right', { active: true, reveal: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	/** The items of the fit report, the vault first, then the largest folders. */
	reportItems(): ReportItem[] {
		const tree = this.tree();
		const root = tree.get('');
		const items: ReportItem[] = [{ label: 'Whole vault', tokens: root?.tokens ?? 0, need: root?.need ?? 0, notes: root?.notes ?? 0 }];
		for (const r of folderRows(tree).slice(0, REPORT_FOLDERS)) items.push({ label: r.path, tokens: r.tokens, need: r.need, notes: r.notes });
		return items;
	}

	/** Writes the fit report to a new note and opens it. Returns the path, or null when nothing was written. */
	async exportReport(now = new Date()): Promise<string | null> {
		if (!isPro()) {
			proNotice('The fit report is a Pro feature.');
			return null;
		}
		if (!this.lastScan) await this.refreshMap();
		if (!this.lastScan) {
			new Notice('The vault count did not finish. Try again in a moment.');
			return null;
		}
		const pad = (n: number): string => String(n).padStart(2, '0');
		const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
		const text = reportMarkdown(this.reportItems(), this.windows(), this.settings.reserve, `${day} ${pad(now.getHours())}.${pad(now.getMinutes())}`, this.settings.margin);
		const base = `Token budget report ${day} ${time}`;
		let path = normalizePath(`${base}.md`);
		for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${base} ${i}.md`);
		const file = await this.app.vault.create(path, text);
		await this.app.workspace.getLeaf(true).openFile(file);
		new Notice(`Saved the fit report to ${path}.`);
		return path;
	}
}
