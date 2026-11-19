import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { FIT_WORDS, fitIn, percent, type ContextWindow } from './budget';
import { formatTokens, shortTokens } from './estimate';
import { childRows, type MapRow } from './scan';
import { isPro, proNotice } from './pro';
import type TokenBudgetMapPlugin from './main';

export const VIEW_TYPE = 'token-budget-map';
/** Rows drawn at most per folder. A hint names the rest. */
export const MAX_ROWS = 300;

export class TokenMapView extends ItemView {
	folder = '';

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: TokenBudgetMapPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Token map';
	}

	getIcon(): string {
		return 'gauge';
	}

	async onOpen(): Promise<void> {
		this.render();
		if (isPro()) await this.plugin.refreshMap();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('tbm-view');
		if (!isPro()) {
			this.renderFree(root);
			return;
		}
		const windows = this.plugin.windows();
		const win = this.plugin.currentWindow(windows);
		this.renderBar(root, windows, win);
		const status = root.createDiv({ cls: 'tbm-status' });
		status.setText(this.plugin.statusLine());
		const tree = this.plugin.tree();
		const node = tree.get(this.folder);
		if (!node) {
			if (this.folder !== '') {
				this.folder = '';
				this.render();
				return;
			}
			root.createDiv({ cls: 'tbm-empty', text: this.plugin.scanning ? 'Counting the notes in your vault.' : 'No notes counted yet. Select Refresh to count the vault.' });
			return;
		}
		this.renderCrumbs(root);
		const total = root.createDiv({ cls: 'tbm-total' });
		total.createSpan({ cls: 'tbm-total-name', text: node.path === '' ? 'Whole vault' : node.path });
		const fit = win ? fitIn(node.tokens, win, this.plugin.settings.reserve, node.need, this.plugin.settings.margin) : null;
		total.createSpan({ cls: 'tbm-total-num', text: `${formatTokens(node.tokens)} tokens in ${formatTokens(node.notes)} notes` });
		if (fit && win) {
			const word = FIT_WORDS[fit.state];
			total.createSpan({ cls: `tbm-${fit.state}`, text: `${word.charAt(0).toUpperCase()}${word.slice(1)} ${win.name}, ${percent(fit.share)}` });
		}
		const rows = childRows(tree, this.folder, this.plugin.index.entries);
		const list = root.createDiv({ cls: 'tbm-list' });
		for (const row of rows.slice(0, MAX_ROWS)) this.renderRow(list, row, win);
		if (rows.length > MAX_ROWS) root.createDiv({ cls: 'tbm-more', text: `${formatTokens(rows.length - MAX_ROWS)} smaller items are not shown.` });
	}

	private renderFree(root: HTMLElement): void {
		root.createEl('p', { text: 'The token map shows how many tokens each folder costs, and what fits in your model windows. It is a Pro feature.' });
		root.createEl('p', { text: 'The status bar count of the active note and the selection is free.' });
		const btn = root.createEl('button', { cls: 'mod-cta', text: 'About Pro' });
		btn.addEventListener('click', () => {
			proNotice('The token map is a Pro feature.');
		});
	}

	private renderBar(root: HTMLElement, windows: ContextWindow[], win: ContextWindow | null): void {
		const bar = root.createDiv({ cls: 'tbm-bar' });
		const select = bar.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Model window' } });
		for (const w of windows) {
			const opt = select.createEl('option', { text: `${w.name} (${shortTokens(w.tokens)})`, value: w.name });
			if (win && w.name === win.name) opt.selected = true;
		}
		select.addEventListener('change', () => {
			void this.plugin.setActiveWindow(select.value);
		});
		const refresh = bar.createEl('button', { text: 'Refresh' });
		refresh.disabled = this.plugin.scanning;
		refresh.addEventListener('click', () => {
			void this.plugin.refreshMap();
		});
		const exp = bar.createEl('button', { text: 'Export report' });
		exp.addEventListener('click', () => {
			void this.plugin.exportReport();
		});
	}

	private renderCrumbs(root: HTMLElement): void {
		const crumbs = root.createDiv({ cls: 'tbm-crumbs' });
		const parts = this.folder === '' ? [] : this.folder.split('/');
		const link = (label: string, path: string): void => {
			const a = crumbs.createEl('a', { text: label, href: '#' });
			a.addEventListener('click', (ev) => {
				ev.preventDefault();
				this.openFolder(path);
			});
		};
		link('Vault', '');
		parts.forEach((p, i) => {
			crumbs.createSpan({ text: ' / ' });
			link(p, parts.slice(0, i + 1).join('/'));
		});
	}

	private renderRow(list: HTMLElement, row: MapRow, win: ContextWindow | null): void {
		const el = list.createDiv({ cls: `tbm-row tbm-${row.kind}` });
		const fit = win ? fitIn(row.tokens, win, this.plugin.settings.reserve, row.need, this.plugin.settings.margin) : null;
		const share = fit ? Math.min(1, fit.share) : 0;
		el.setCssProps({ '--tbm-share': `${(share * 100).toFixed(1)}%` });
		if (fit?.state === 'over') el.addClass('tbm-over');
		if (fit?.state === 'near') el.addClass('tbm-near-row');
		el.createSpan({ cls: 'tbm-name', text: row.kind === 'folder' ? `${row.name}/` : row.name });
		el.createSpan({ cls: 'tbm-num', text: formatTokens(row.tokens) });
		el.createSpan({ cls: 'tbm-share', text: fit ? percent(fit.share) : '' });
		el.setAttr('aria-label', `${row.name}, ${formatTokens(row.tokens)} tokens${row.kind === 'folder' ? ` in ${formatTokens(row.notes)} notes` : ''}${fit ? `, ${FIT_WORDS[fit.state]}` : ''}`);
		el.addEventListener('click', () => {
			if (row.kind === 'folder') this.openFolder(row.path);
			else void this.app.workspace.openLinkText(row.path, '', false);
		});
	}

	/** Shows one folder. Not named open: View.open(containerEl) is the internal method that attaches the view to its leaf. */
	openFolder(folder: string): void {
		this.folder = folder;
		this.render();
	}
}
