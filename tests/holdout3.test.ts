// Replays every note of the R1 holdout3 set (lanes/R1-B2/holdout3 of sprint s1119b) through the fit logic.
// Each fixture has its o200k count (js-tiktoken 1.0.21), measured once by lanes/B2/measure3.mjs.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimateTokens } from '../src/estimate';
import { needTokens, noteClasses } from '../src/accuracy';
import { fitIn } from '../src/budget';
import fixtures from './fixtures/holdout3.json';

const dir = join(__dirname, 'fixtures', 'holdout3');
const notes = fixtures.map((f) => {
	const text = readFileSync(join(dir, f.name), 'utf8');
	const est = estimateTokens(text);
	return { ...f, text, est, need: needTokens(est, noteClasses(text)) };
});

describe('holdout3 replay (33 notes, o200k counts as fixtures)', () => {
	it('has all 33 notes and the estimate matches the measured one', () => {
		expect(notes.length).toBe(33);
		for (const n of notes) expect(estimateTokens(n.text), n.name).toBe(fixtures.find((f) => f.name === n.name)!.est);
	});
	it('planned tokens are never below the real count', () => {
		for (const n of notes) expect(n.need, n.name).toBeGreaterThanOrEqual(n.real);
	});
	it('never says fits for a window that the real count overflows', () => {
		let checked = 0;
		for (const n of notes) {
			// Every window from the estimate up to one token below the real count.
			for (const size of [n.est, Math.ceil(n.est * 1.15), n.real - 1, Math.floor((n.est + n.real) / 2)]) {
				if (size >= n.real || size < 1) continue;
				const f = fitIn(n.est, { name: 'w', tokens: size }, 0, n.need);
				expect(f.fits, `${n.name} window ${size}`).toBe(false);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(20);
	});
	it('says near the limit when the estimate fits but the margin does not', () => {
		const near = notes.filter((n) => fitIn(n.est, { name: 'w', tokens: n.est }, 0, n.need).state === 'near');
		expect(near.length).toBe(33);
	});
	it('says fits once the window holds the planned tokens', () => {
		for (const n of notes) expect(fitIn(n.est, { name: 'w', tokens: n.need }, 0, n.need).state, n.name).toBe('fits');
	});
	it('flags every emoji, base64, CJK and table note of the set', () => {
		for (const n of notes) {
			const cls = noteClasses(n.text);
			const kind = n.name.replace(/-\d+\.md$/, '');
			if (kind === 'emoji') expect(cls, n.name).toContain('emoji');
			if (kind === 'b64') expect(cls, n.name).toContain('base64');
			if (kind === 'cjk') expect(cls, n.name).toContain('cjk');
			if (kind === 'table') expect(cls, n.name).toContain('table');
			if (kind === 'code') expect(cls, n.name).toContain('code');
			if (kind === 'english') expect(cls, n.name).toEqual([]);
		}
	});
});
