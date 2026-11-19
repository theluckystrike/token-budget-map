// Vault scan with a cache per file. A file is read again only when its mtime or size changed.
// The scan reads in small batches and gives the main thread back after each time slice, so typing stays smooth.
import { estimateTokens } from './estimate';
import { needTokens, noteClasses } from './accuracy';

export interface FileRef {
	path: string;
	mtime: number;
	size: number;
}

export interface Entry {
	mtime: number;
	size: number;
	tokens: number;
	/** Tokens to plan for, the estimate with the margin of its kind of note. */
	need: number;
}

export interface ScanOptions {
	/** Longest run of work before the scan yields, in ms. */
	sliceMs?: number;
	/** Files read at the same time. */
	batch?: number;
	now?: () => number;
	/** Gives the main thread back. The default waits for a macrotask. */
	yieldFn?: () => Promise<void>;
	/** The scan stops early when this returns true. */
	cancelled?: () => boolean;
}

export interface ScanStats {
	files: number;
	read: number;
	cached: number;
	failed: number;
	tokens: number;
	ms: number;
	complete: boolean;
}

const defaultYield = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

export class TokenIndex {
	readonly entries = new Map<string, Entry>();
	private generation = 0;

	/** Counts each file, from the cache when mtime and size match. Drops entries of files that are gone. */
	async scan(files: readonly FileRef[], read: (path: string) => Promise<string>, opts: ScanOptions = {}): Promise<ScanStats> {
		const now = opts.now ?? (() => performance.now());
		const sliceMs = opts.sliceMs ?? 12;
		const batch = Math.max(1, opts.batch ?? 24);
		const yieldFn = opts.yieldFn ?? defaultYield;
		const gen = ++this.generation;
		const stop = (): boolean => gen !== this.generation || (opts.cancelled?.() ?? false);
		const start = now();
		let sliceStart = start;
		const stats: ScanStats = { files: files.length, read: 0, cached: 0, failed: 0, tokens: 0, ms: 0, complete: false };
		const seen = new Set<string>();
		const pending: FileRef[] = [];

		const flush = async (): Promise<void> => {
			const texts = await Promise.all(pending.map((f) => read(f.path).then((t) => t, () => null)));
			if (stop()) return;
			for (let k = 0; k < pending.length; k++) {
				const f = pending[k]!;
				const text = texts[k];
				if (text === null || text === undefined) {
					stats.failed++;
					this.entries.delete(f.path);
					continue;
				}
				const tokens = estimateTokens(text);
				this.entries.set(f.path, { mtime: f.mtime, size: f.size, tokens, need: needTokens(tokens, noteClasses(text)) });
				stats.read++;
			}
			pending.length = 0;
		};

		for (const f of files) {
			seen.add(f.path);
			const old = this.entries.get(f.path);
			if (old && old.mtime === f.mtime && old.size === f.size) {
				stats.cached++;
			} else {
				pending.push(f);
				if (pending.length >= batch) {
					await flush();
					if (stop()) return this.finish(stats, start, now, false);
				}
			}
			if (now() - sliceStart >= sliceMs) {
				await yieldFn();
				if (stop()) return this.finish(stats, start, now, false);
				sliceStart = now();
			}
		}
		if (pending.length) await flush();
		if (stop()) return this.finish(stats, start, now, false);
		for (const path of [...this.entries.keys()]) if (!seen.has(path)) this.entries.delete(path);
		return this.finish(stats, start, now, true);
	}

	private finish(stats: ScanStats, start: number, now: () => number, complete: boolean): ScanStats {
		stats.ms = now() - start;
		stats.complete = complete;
		let total = 0;
		for (const e of this.entries.values()) total += e.tokens;
		stats.tokens = total;
		return stats;
	}

	/** A file or folder moved. The counts stay valid, so the cache keeps them under the new path. */
	rename(oldPath: string, newPath: string, isFolder = false): void {
		if (isFolder) {
			const from = `${oldPath}/`;
			const to = `${newPath}/`;
			for (const [key, e] of [...this.entries]) {
				if (!key.startsWith(from)) continue;
				this.entries.delete(key);
				this.entries.set(to + key.slice(from.length), e);
			}
			return;
		}
		const e = this.entries.get(oldPath);
		if (!e) return;
		this.entries.delete(oldPath);
		this.entries.set(newPath, e);
	}

	remove(path: string, isFolder = false): void {
		this.entries.delete(path);
		if (!isFolder) return;
		// A deleted folder removes every note below it.
		const prefix = path.endsWith('/') ? path : `${path}/`;
		for (const key of [...this.entries.keys()]) if (key.startsWith(prefix)) this.entries.delete(key);
	}

	/** Stops a running scan. */
	cancel(): void {
		this.generation++;
	}

	clear(): void {
		this.cancel();
		this.entries.clear();
	}
}

export interface FolderNode {
	path: string;
	name: string;
	tokens: number;
	need: number;
	notes: number;
	folders: Set<string>;
	files: string[];
}

export interface MapRow {
	path: string;
	name: string;
	kind: 'folder' | 'note';
	tokens: number;
	need: number;
	notes: number;
}

function parentOf(path: string): string {
	const i = path.lastIndexOf('/');
	return i < 0 ? '' : path.slice(0, i);
}

function nameOf(path: string): string {
	return path === '' ? 'Vault' : path.slice(path.lastIndexOf('/') + 1);
}

/** Sums the tokens of each folder and of the vault (path ""). Linear in notes times folder depth. */
export function buildTree(entries: Iterable<[string, Entry]>): Map<string, FolderNode> {
	const tree = new Map<string, FolderNode>();
	const node = (path: string): FolderNode => {
		let n = tree.get(path);
		if (!n) {
			n = { path, name: nameOf(path), tokens: 0, need: 0, notes: 0, folders: new Set(), files: [] };
			tree.set(path, n);
		}
		return n;
	};
	node('');
	for (const [path, e] of entries) {
		let dir = parentOf(path);
		node(dir).files.push(path);
		let child = '';
		for (;;) {
			const n = node(dir);
			n.tokens += e.tokens;
			n.need += e.need;
			n.notes += 1;
			if (child) n.folders.add(child);
			if (dir === '') break;
			child = dir;
			dir = parentOf(dir);
		}
	}
	return tree;
}

/** Folders and notes directly inside a folder, the largest first. Ties sort by name. */
export function childRows(tree: Map<string, FolderNode>, folder: string, entries: Map<string, Entry>): MapRow[] {
	const n = tree.get(folder);
	if (!n) return [];
	const rows: MapRow[] = [];
	for (const f of n.folders) {
		const c = tree.get(f)!;
		rows.push({ path: f, name: c.name, kind: 'folder', tokens: c.tokens, need: c.need, notes: c.notes });
	}
	for (const p of n.files) {
		const e = entries.get(p);
		if (e) rows.push({ path: p, name: nameOf(p).replace(/\.md$/i, ''), kind: 'note', tokens: e.tokens, need: e.need, notes: 1 });
	}
	return rows.sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
}

/** Every folder (without the vault row), the largest first. */
export function folderRows(tree: Map<string, FolderNode>): MapRow[] {
	const rows: MapRow[] = [];
	for (const n of tree.values()) if (n.path !== '') rows.push({ path: n.path, name: n.path, kind: 'folder', tokens: n.tokens, need: n.need, notes: n.notes });
	return rows.sort((a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path));
}
