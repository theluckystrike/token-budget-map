import { PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { DEFAULT_EXTRA_MARGIN, DEFAULT_WINDOWS_TEXT, parseWindows } from './budget';
import { PRO_UI } from './pro';
import type TokenBudgetMapPlugin from './main';

export interface TokenBudgetMapSettings {
	statusBar: boolean;
	selection: boolean;
	windowsText: string;
	activeWindow: string;
	reserve: number;
	margin: number;
	skipFolders: string;
}

export const DEFAULT_SETTINGS: TokenBudgetMapSettings = {
	statusBar: true,
	selection: true,
	windowsText: DEFAULT_WINDOWS_TEXT,
	activeWindow: 'Medium window',
	reserve: 4000,
	margin: DEFAULT_EXTRA_MARGIN,
	skipFolders: '',
};

/** Fills gaps and drops bad values from saved data, so old or hand-edited data.json never breaks the plugin. */
export function normalizeSettings(saved: Partial<TokenBudgetMapSettings> | null | undefined): TokenBudgetMapSettings {
	const s = (saved ?? {}) as Partial<Record<keyof TokenBudgetMapSettings, unknown>>;
	const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
	const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
	const reserve = typeof s.reserve === 'number' && Number.isFinite(s.reserve) && s.reserve >= 0 ? Math.min(Math.round(s.reserve), 10_000_000) : DEFAULT_SETTINGS.reserve;
	return {
		statusBar: bool(s.statusBar, DEFAULT_SETTINGS.statusBar),
		selection: bool(s.selection, DEFAULT_SETTINGS.selection),
		windowsText: str(s.windowsText, DEFAULT_SETTINGS.windowsText),
		activeWindow: str(s.activeWindow, DEFAULT_SETTINGS.activeWindow),
		reserve,
		margin: typeof s.margin === 'number' && Number.isFinite(s.margin) && s.margin >= 0 && s.margin <= 100 ? Math.round(s.margin) : DEFAULT_SETTINGS.margin,
		skipFolders: str(s.skipFolders, DEFAULT_SETTINGS.skipFolders),
	};
}

/** Folder paths to leave out of the map, one per line, without leading or trailing slashes. */
export function skipList(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((l) => l.trim().replace(/^\/+|\/+$/g, ''))
		.filter((l) => l.length > 0);
}

export function isSkipped(path: string, skip: readonly string[]): boolean {
	for (const s of skip) if (path === s || path.startsWith(`${s}/`)) return true;
	return false;
}

export class TokenBudgetMapSettingTab extends PluginSettingTab {
	plugin: TokenBudgetMapPlugin;

	constructor(app: App, plugin: TokenBudgetMapPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const items: SettingDefinitionItem[] = [
			{
				name: 'Count in the status bar',
				desc: 'Show the estimated tokens of the active note.',
				control: { type: 'toggle', key: 'statusBar', defaultValue: DEFAULT_SETTINGS.statusBar },
			},
			{
				name: 'Count the selection',
				desc: 'Add the estimated tokens of the selected text.',
				control: { type: 'toggle', key: 'selection', defaultValue: DEFAULT_SETTINGS.selection },
			},
			{
				type: 'group',
				heading: 'Token map and budgets (Pro)',
				items: [
					{
						name: 'Model windows',
						desc: 'One window per line, as a name, an equals sign and a size, for example "My model = 128k". Use the size from the documentation of your model.',
						control: {
							type: 'textarea',
							key: 'windowsText',
							defaultValue: DEFAULT_SETTINGS.windowsText,
							rows: 6,
							validate: (v: string) => {
								const p = parseWindows(v);
								return p.errors[0] ?? (p.windows.length ? undefined : 'Add at least one window.');
							},
						},
					},
					{
						name: 'Room for the prompt and the answer',
						desc: 'Tokens that each window keeps free. Content fits when it uses the rest or less.',
						control: { type: 'number', key: 'reserve', defaultValue: DEFAULT_SETTINGS.reserve, min: 0, step: 1000 },
					},
					{
						name: 'Extra safety margin in percent',
						desc: 'Each note already gets the largest underestimate that we measured for its kind. This margin goes on top. The default is 0.',
						control: { type: 'number', key: 'margin', defaultValue: DEFAULT_SETTINGS.margin, min: 0, max: 100, step: 1 },
					},
					{
						name: 'Folders to skip',
						desc: 'One folder path per line. The map leaves out these folders and everything in them.',
						control: { type: 'textarea', key: 'skipFolders', defaultValue: DEFAULT_SETTINGS.skipFolders, rows: 3, placeholder: 'Templates' },
					},
				],
			},
		];
		if (this.plugin.pro) items.push(...sponsorsSettingItems(this.plugin.pro, PRO_UI));
		return items;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const next = normalizeSettings({ ...this.plugin.settings, [key]: value });
		this.plugin.settings = next;
		await this.plugin.saveSettings();
		this.plugin.onSettingsChanged();
	}
}
