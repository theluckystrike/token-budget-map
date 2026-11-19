// Context window budgets. The plugin ships plain sizes with no model names.
// The user names each window after the model that they use (BRIEF.md, "Window sizes").
import { formatTokens } from './estimate';

export interface ContextWindow {
	name: string;
	tokens: number;
}

export const DEFAULT_WINDOWS_TEXT = ['Small window = 32k', 'Medium window = 128k', 'Large window = 200k', 'Huge window = 1M'].join('\n');

/** Reads "128k", "1M", "200,000" or "200_000". Returns null for anything else. */
export function parseSize(raw: string): number | null {
	const m = /^\s*(\d+(?:\.\d+)?)\s*([kKmM]?)\s*$/.exec(raw.replace(/[,_\s](?=\d)/g, ''));
	if (!m) return null;
	const mult = m[2] === 'k' || m[2] === 'K' ? 1000 : m[2] === 'm' || m[2] === 'M' ? 1_000_000 : 1;
	const n = Math.round(Number(m[1]) * mult);
	return Number.isFinite(n) && n > 0 && n <= 100_000_000 ? n : null;
}

export interface ParsedWindows {
	windows: ContextWindow[];
	errors: string[];
}

/** One window per line, "Name = size". Blank lines and lines that start with # are skipped. */
export function parseWindows(text: string): ParsedWindows {
	const windows: ContextWindow[] = [];
	const errors: string[] = [];
	const names = new Set<string>();
	text.split(/\r?\n/).forEach((line, i) => {
		const t = line.trim();
		if (!t || t.startsWith('#')) return;
		const eq = t.lastIndexOf('=');
		const name = eq < 0 ? '' : t.slice(0, eq).trim();
		const tokens = eq < 0 ? null : parseSize(t.slice(eq + 1));
		if (!name || tokens === null) {
			errors.push(`Line ${i + 1} needs a name, an equals sign and a size, for example "My model = 128k".`);
			return;
		}
		if (names.has(name.toLowerCase())) {
			errors.push(`Line ${i + 1} repeats the name "${name}".`);
			return;
		}
		names.add(name.toLowerCase());
		windows.push({ name, tokens });
	});
	return { windows, errors };
}

/** Extra margin in percent on top of the measured margin of each kind of note. */
export const DEFAULT_EXTRA_MARGIN = 0;

export type FitState = 'fits' | 'near' | 'over';

export interface Fit {
	/** True only when the planned tokens (the estimate with its margin) fit. */
	fits: boolean;
	/** fits, near (the estimate fits but the planned tokens do not) or over (the estimate does not fit). */
	state: FitState;
	/** Share of the usable window that the estimate takes, 1 = full. */
	share: number;
	/** Usable tokens left after the planned tokens. Negative when they do not fit. */
	room: number;
	usable: number;
}

/** The usable window is the window minus the room kept for the prompt and the answer.
 * need is the token count to plan for (needTokens in src/accuracy.ts). An extra margin in percent goes on top. */
export function fitIn(tokens: number, window: ContextWindow, reserve: number, need = tokens, extraPercent = 0): Fit {
	const usable = Math.max(0, window.tokens - Math.max(0, reserve));
	const plan = Math.ceil(Math.max(need, tokens) * (1 + Math.max(0, extraPercent) / 100));
	const share = usable > 0 ? tokens / usable : tokens > 0 ? Infinity : 0;
	const state: FitState = plan <= usable ? 'fits' : tokens <= usable ? 'near' : 'over';
	return { fits: state === 'fits', state, share, room: usable - plan, usable };
}

export const FIT_WORDS: Record<FitState, string> = { fits: 'fits', near: 'near the limit', over: 'does not fit' };

export function percent(share: number): string {
	if (!Number.isFinite(share)) return 'over 999 %';
	const p = share * 100;
	if (p > 999) return 'over 999 %';
	if (p > 0 && p < 1) return 'under 1 %';
	return `${Math.round(p)} %`;
}

export interface ReportItem {
	label: string;
	tokens: number;
	/** Tokens to plan for, the estimate with the margin of each note. */
	need: number;
	notes: number;
}

function cell(text: string): string {
	return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** The fit report as a Markdown note. Each cell says fits, near the limit or does not fit, with the share of the usable window. */
export function reportMarkdown(items: readonly ReportItem[], windows: readonly ContextWindow[], reserve: number, stamp: string, extraPercent = DEFAULT_EXTRA_MARGIN): string {
	const lines: string[] = [];
	lines.push('# Token budget report', '');
	lines.push(`Made ${stamp} by Token Budget Map.`);
	lines.push('All counts are estimates. In our test, plain prose was 3 % under to 9 % over a real tokenizer, and notes with emoji were up to 38 % under.');
	lines.push(`Each window keeps ${formatTokens(reserve)} tokens free for the prompt and the answer.`);
	lines.push('Fits means that the estimate fits with the margin of each note. The margin is the largest underestimate that we measured for that kind of note.');
	if (extraPercent > 0) lines.push(`An extra margin of ${extraPercent} % is added.`);
	lines.push('Near the limit means that the estimate fits but the margin does not.', '');
	if (!windows.length) {
		lines.push('Add a window in the settings to see what fits.', '');
	}
	const head = ['Content', 'Notes', 'Tokens', ...windows.map((w) => `${cell(w.name)} (${formatTokens(w.tokens)})`)];
	lines.push(`| ${head.join(' | ')} |`);
	lines.push(`| ${head.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`);
	for (const it of items) {
		const cells = windows.map((w) => {
			const f = fitIn(it.tokens, w, reserve, it.need, extraPercent);
			return `${FIT_WORDS[f.state]} (${percent(f.share)})`;
		});
		lines.push(`| ${[cell(it.label), formatTokens(it.notes), formatTokens(it.tokens), ...cells].join(' | ')} |`);
	}
	lines.push('');
	return lines.join('\n');
}
