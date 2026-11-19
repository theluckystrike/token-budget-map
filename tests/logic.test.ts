import { describe, expect, it } from 'vitest';
import { estimateTokens, formatTokens, shortTokens } from '../src/estimate';
import { TokenIndex, buildTree, childRows, folderRows, type FileRef } from '../src/scan';
import { DEFAULT_WINDOWS_TEXT, fitIn, parseSize, parseWindows, percent, reportMarkdown } from '../src/budget';
import { isSkipped, normalizeSettings, skipList, DEFAULT_SETTINGS } from '../src/settings';

const noYield = (): Promise<void> => Promise.resolve();

function vault(n: number, folders = 50): { files: FileRef[]; texts: Map<string, string> } {
	const files: FileRef[] = [];
	const texts = new Map<string, string>();
	for (let i = 0; i < n; i++) {
		const path = `F${i % folders}/sub${i % 3}/note ${i}.md`;
		const text = `# Note ${i}\n\nSome words about item ${i} and its links [[note ${i + 1}]].\n`.repeat(1 + (i % 7));
		texts.set(path, text);
		files.push({ path, mtime: 1000 + i, size: text.length });
	}
	return { files, texts };
}

describe('estimateTokens', () => {
	it('grows with the text and is never negative', () => {
		const a = estimateTokens('word '.repeat(100));
		const b = estimateTokens('word '.repeat(200));
		expect(a).toBe(100);
		expect(b).toBe(200);
	});
	it('counts CRLF like LF plus nothing', () => {
		expect(estimateTokens('a\r\nb')).toBe(estimateTokens('a\nb'));
	});
	it('keeps a surrogate pair together', () => {
		expect(estimateTokens('𝒜𝒜𝒜𝒜')).toBe(4);
		expect(estimateTokens('a\ud835')).toBe(2);
	});
	it('counts a 1 MB note in well under 200 ms', () => {
		const text = 'The quick brown fox, 1234 jumps! '.repeat(32000);
		const t0 = performance.now();
		const n = estimateTokens(text);
		expect(performance.now() - t0).toBeLessThan(200);
		expect(n).toBeGreaterThan(200000);
	});
	it('formats numbers', () => {
		expect(formatTokens(1234567)).toBe('1,234,567');
		expect(shortTokens(999)).toBe('999');
		expect(shortTokens(128000)).toBe('128k');
		expect(shortTokens(1200000)).toBe('1.2M');
		expect(shortTokens(1000000)).toBe('1M');
	});
});

describe('budget', () => {
	it('default windows parse with no error and no model names', () => {
		const p = parseWindows(DEFAULT_WINDOWS_TEXT);
		expect(p.errors).toEqual([]);
		expect(p.windows.map((w) => w.tokens)).toEqual([32000, 128000, 200000, 1000000]);
		expect(DEFAULT_WINDOWS_TEXT).not.toMatch(/gpt|claude|gemini|llama|mistral|opus|sonnet/i);
	});
	it('uses the last equals sign, so a name may hold one', () => {
		expect(parseWindows('a = b = 64k').windows).toEqual([{ name: 'a = b', tokens: 64000 }]);
	});
	it('refuses sizes that are not numbers', () => {
		expect(parseSize('12x')).toBeNull();
		expect(parseSize('-5')).toBeNull();
		expect(parseSize('1e9')).toBeNull();
		expect(parseSize('2 M')).toBe(2000000);
	});
	it('a reserve larger than the window leaves no room', () => {
		const f = fitIn(1, { name: 'w', tokens: 10 }, 50);
		expect(f.fits).toBe(false);
		expect(percent(f.share)).toBe('over 999 %');
		expect(fitIn(0, { name: 'w', tokens: 10 }, 50).fits).toBe(true);
	});
	it('a negative reserve counts as 0', () => {
		expect(fitIn(10, { name: 'w', tokens: 10 }, -5)).toMatchObject({ fits: true, usable: 10 });
	});
	it('percent rounds', () => {
		expect(percent(0)).toBe('0 %');
		expect(percent(0.456)).toBe('46 %');
		expect(percent(9.99)).toBe('999 %');
	});
	it('report has one fit cell per window and escapes pipes', () => {
		const md = reportMarkdown(
			[
				{ label: 'Whole vault', tokens: 150000, notes: 10 },
				{ label: 'a|b', tokens: 100, notes: 1 },
			],
			[
				{ name: 'S', tokens: 32000 },
				{ name: 'L', tokens: 200000 },
			],
			4000,
			'2026-11-19 21.40',
			0,
		);
		const lines = md.split('\n');
		expect(lines).toContain('| Content | Notes | Tokens | S (32,000) | L (200,000) |');
		expect(lines).toContain('| Whole vault | 10 | 150,000 | does not fit (536 %) | fits (77 %) |');
		expect(lines).toContain('| a\\|b | 1 | 100 | fits (under 1 %) | fits (under 1 %) |');
		expect(md).toContain('estimates');
	});
	it('report says near the limit when the estimate fits but the planned tokens do not', () => {
		const md = reportMarkdown(
			[
				{ label: 'A', tokens: 90, need: 120, notes: 1 },
				{ label: 'B', tokens: 80, need: 95, notes: 1 },
				{ label: 'C', tokens: 101, need: 130, notes: 1 },
			],
			[{ name: 'S', tokens: 100 }],
			0,
			'x',
		);
		expect(md).toContain('| A | 1 | 90 | near the limit (90 %) |');
		expect(md).toContain('| B | 1 | 80 | fits (80 %) |');
		expect(md).toContain('| C | 1 | 101 | does not fit (101 %) |');
		expect(md).toContain('largest underestimate');
		expect(reportMarkdown([{ label: 'B', tokens: 80, need: 95, notes: 1 }], [{ name: 'S', tokens: 100 }], 0, 'x', 10)).toContain('| B | 1 | 80 | near the limit (80 %) |');
	});
	it('report without windows asks for one', () => {
		expect(reportMarkdown([{ label: 'Whole vault', tokens: 1, notes: 1 }], [], 0, 'x')).toContain('Add a window');
	});
});

describe('settings', () => {
	it('repairs bad saved settings', () => {
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({ statusBar: 'yes' as never, reserve: -1, windowsText: 5 as never })).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({ reserve: 1234.6 }).reserve).toBe(1235);
		expect(normalizeSettings({ reserve: Number.NaN }).reserve).toBe(DEFAULT_SETTINGS.reserve);
		expect(normalizeSettings({ margin: 150 }).margin).toBe(DEFAULT_SETTINGS.margin);
		expect(normalizeSettings({ margin: -1 }).margin).toBe(DEFAULT_SETTINGS.margin);
		expect(normalizeSettings({ margin: 0 }).margin).toBe(0);
		expect(DEFAULT_SETTINGS.margin).toBe(0);
	});
	it('skip list matches the folder and its children only', () => {
		const s = skipList(' /Templates/ \n\nArchive/old');
		expect(s).toEqual(['Templates', 'Archive/old']);
		expect(isSkipped('Templates/a.md', s)).toBe(true);
		expect(isSkipped('Templates2/a.md', s)).toBe(false);
		expect(isSkipped('Archive/old/x.md', s)).toBe(true);
		expect(isSkipped('Archive/new.md', s)).toBe(false);
	});
});

describe('TokenIndex', () => {
	it('reads each note once, then only changed notes', async () => {
		const { files, texts } = vault(100);
		const idx = new TokenIndex();
		let reads = 0;
		const read = (p: string): Promise<string> => {
			reads++;
			return Promise.resolve(texts.get(p)!);
		};
		const s1 = await idx.scan(files, read, { yieldFn: noYield });
		expect(s1).toMatchObject({ files: 100, read: 100, cached: 0, complete: true });
		expect(reads).toBe(100);
		files[3] = { ...files[3]!, mtime: 99999 };
		files[4] = { ...files[4]!, size: files[4]!.size + 1 };
		const s2 = await idx.scan(files, read, { yieldFn: noYield });
		expect(s2).toMatchObject({ read: 2, cached: 98 });
		expect(reads).toBe(102);
	});
	it('the total is the sum of the note estimates', async () => {
		const { files, texts } = vault(30);
		const idx = new TokenIndex();
		const s = await idx.scan(files, (p) => Promise.resolve(texts.get(p)!), { yieldFn: noYield });
		let sum = 0;
		for (const t of texts.values()) sum += estimateTokens(t);
		expect(s.tokens).toBe(sum);
	});
	it('drops notes that are gone and moves renamed notes', async () => {
		const { files, texts } = vault(10);
		const idx = new TokenIndex();
		const read = (p: string): Promise<string> => Promise.resolve(texts.get(p) ?? texts.get(files[0]!.path)!);
		await idx.scan(files, read, { yieldFn: noYield });
		const before = idx.entries.get(files[1]!.path)!;
		idx.rename(files[1]!.path, 'new/place.md');
		expect(idx.entries.get('new/place.md')).toBe(before);
		expect(idx.entries.has(files[1]!.path)).toBe(false);
		await idx.scan(files.slice(2), read, { yieldFn: noYield });
		expect(idx.entries.size).toBe(8);
	});
	it('a folder rename moves the notes below it and keeps their counts', async () => {
		const idx = new TokenIndex();
		const files: FileRef[] = ['a/x.md', 'a/b/y.md', 'ab/z.md'].map((path) => ({ path, mtime: 1, size: 1 }));
		await idx.scan(files, () => Promise.resolve('x'), { yieldFn: noYield });
		idx.rename('a', 'c', true);
		expect([...idx.entries.keys()].sort()).toEqual(['ab/z.md', 'c/b/y.md', 'c/x.md']);
	});
	it('removes a folder with its notes, and a note alone', async () => {
		const idx = new TokenIndex();
		const files: FileRef[] = ['a/x.md', 'a/b/y.md', 'ab/z.md', 'c.md'].map((path) => ({ path, mtime: 1, size: 1 }));
		await idx.scan(files, () => Promise.resolve('x'), { yieldFn: noYield });
		idx.remove('a', true);
		expect([...idx.entries.keys()].sort()).toEqual(['ab/z.md', 'c.md']);
		idx.remove('c.md');
		expect([...idx.entries.keys()]).toEqual(['ab/z.md']);
	});
	it('a note that cannot be read is counted as failed and not cached', async () => {
		const idx = new TokenIndex();
		const files: FileRef[] = [
			{ path: 'a.md', mtime: 1, size: 1 },
			{ path: 'b.md', mtime: 1, size: 1 },
		];
		const s = await idx.scan(files, (p) => (p === 'a.md' ? Promise.reject(new Error('x')) : Promise.resolve('hello')), { yieldFn: noYield });
		expect(s).toMatchObject({ read: 1, failed: 1, tokens: 1 });
		expect(idx.entries.has('a.md')).toBe(false);
	});
	it('a new scan stops the old one, and the old one is not complete', async () => {
		const { files, texts } = vault(200);
		const idx = new TokenIndex();
		const read = (p: string): Promise<string> => Promise.resolve(texts.get(p)!);
		let t = 0;
		const first = idx.scan(files, read, { now: () => (t += 20), sliceMs: 10, yieldFn: noYield });
		const second = idx.scan(files, read, { yieldFn: noYield });
		const [a, b] = await Promise.all([first, second]);
		expect(a.complete).toBe(false);
		expect(b.complete).toBe(true);
		expect(idx.entries.size).toBe(200);
	});
	it('cancel stops a scan', async () => {
		const { files, texts } = vault(200);
		const idx = new TokenIndex();
		let calls = 0;
		const s = await idx.scan(files, (p) => Promise.resolve(texts.get(p)!), {
			batch: 10,
			yieldFn: noYield,
			cancelled: () => ++calls > 3,
		});
		expect(s.complete).toBe(false);
		expect(idx.entries.size).toBeLessThan(200);
	});
});

describe('tree', () => {
	it('adds each note to every parent and to the vault', () => {
		const entries = new Map([
			['a/b/x.md', { mtime: 1, size: 1, tokens: 10 }],
			['a/y.md', { mtime: 1, size: 1, tokens: 5 }],
			['z.md', { mtime: 1, size: 1, tokens: 1 }],
		]);
		const tree = buildTree(entries);
		expect(tree.get('')).toMatchObject({ tokens: 16, notes: 3 });
		expect(tree.get('a')).toMatchObject({ tokens: 15, notes: 2 });
		expect(tree.get('a/b')).toMatchObject({ tokens: 10, notes: 1 });
		expect(childRows(tree, '', entries).map((r) => [r.name, r.kind, r.tokens])).toEqual([
			['a', 'folder', 15],
			['z', 'note', 1],
		]);
		expect(childRows(tree, 'a', entries).map((r) => r.name)).toEqual(['b', 'y']);
		expect(childRows(tree, 'missing', entries)).toEqual([]);
		expect(folderRows(tree).map((r) => r.path)).toEqual(['a', 'a/b']);
	});
	it('folders add the planned tokens of their notes', () => {
		const entries = new Map([
			['a/x.md', { mtime: 1, size: 1, tokens: 10, need: 16 }],
			['a/y.md', { mtime: 1, size: 1, tokens: 5, need: 6 }],
		]);
		const tree = buildTree(entries);
		expect(tree.get('a')).toMatchObject({ tokens: 15, need: 22 });
		expect(tree.get('')).toMatchObject({ tokens: 15, need: 22 });
		expect(childRows(tree, '', entries)[0]).toMatchObject({ tokens: 15, need: 22 });
	});
	it('ties sort by name', () => {
		const entries = new Map([
			['b.md', { mtime: 1, size: 1, tokens: 3 }],
			['a.md', { mtime: 1, size: 1, tokens: 3 }],
		]);
		expect(childRows(buildTree(entries), '', entries).map((r) => r.name)).toEqual(['a', 'b']);
	});
});

describe('performance (acceptance case 7)', () => {
	it('scans 10,000 notes in under 2 s and the event loop runs during the scan', async () => {
		const { files, texts } = vault(10000, 100);
		const idx = new TokenIndex();
		const read = (p: string): Promise<string> => Promise.resolve(texts.get(p)!);
		// A timer chain stands in for typing. It must keep firing while the scan runs.
		let ticks = 0;
		let longest = 0;
		let last = performance.now();
		let running = true;
		const tick = (): void => {
			const now = performance.now();
			longest = Math.max(longest, now - last);
			last = now;
			ticks++;
			if (running) setTimeout(tick, 0);
		};
		setTimeout(tick, 0);
		const t0 = performance.now();
		const s = await idx.scan(files, read);
		const ms = performance.now() - t0;
		running = false;
		expect(s.complete).toBe(true);
		expect(s.read).toBe(10000);
		expect(ms).toBeLessThan(2000);
		expect(ticks).toBeGreaterThanOrEqual(3);
		expect(longest).toBeLessThan(150);
		const t1 = performance.now();
		const s2 = await idx.scan(files, read);
		expect(s2.cached).toBe(10000);
		expect(performance.now() - t1).toBeLessThan(300);
		const t2 = performance.now();
		const tree = buildTree(idx.entries);
		expect(tree.get('')!.notes).toBe(10000);
		expect(childRows(tree, '', idx.entries).length).toBe(100);
		expect(performance.now() - t2).toBeLessThan(300);
	});
	it('gives the main thread back after each time slice, also when every note is cached', async () => {
		const { files, texts } = vault(2000, 10);
		const idx = new TokenIndex();
		let clock = 0;
		let yields = 0;
		const opts = { now: () => (clock += 1), sliceMs: 12, yieldFn: () => (yields++, Promise.resolve()) };
		await idx.scan(files, (p) => Promise.resolve(texts.get(p)!), opts);
		expect(yields).toBeGreaterThan(20);
		const first = yields;
		await idx.scan(files, (p) => Promise.resolve(texts.get(p)!), opts);
		expect(yields - first).toBeGreaterThan(100);
	});
	it('a cached rescan of 30,000 notes takes under 150 ms', async () => {
		const files: FileRef[] = [];
		for (let i = 0; i < 30000; i++) files.push({ path: `f${i % 300}/n${i}.md`, mtime: i, size: 1 });
		const idx = new TokenIndex();
		await idx.scan(files, () => Promise.resolve('x'), { yieldFn: noYield });
		const t0 = performance.now();
		const s = await idx.scan(files, () => Promise.resolve('x'), { yieldFn: noYield });
		expect(s.cached).toBe(30000);
		expect(performance.now() - t0).toBeLessThan(150);
	});
	it('scan time grows about linearly from 2,000 to 20,000 notes', async () => {
		const time = async (n: number): Promise<number> => {
			const { files, texts } = vault(n, 100);
			const idx = new TokenIndex();
			const t0 = performance.now();
			await idx.scan(files, (p) => Promise.resolve(texts.get(p)!), { yieldFn: noYield });
			return performance.now() - t0;
		};
		await time(500);
		const small = await time(2000);
		const big = await time(20000);
		expect(big / Math.max(small, 1)).toBeLessThan(30);
	});
});
