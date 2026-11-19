import { describe, expect, it } from 'vitest';
import vectors from './vectors/token-budget-map.json';
import { estimateTokens, shortTokens } from '../src/estimate';
import { needTokens, noteClasses } from '../src/accuracy';
import { fitIn, parseSize, parseWindows, percent } from '../src/budget';

const fns: Record<string, (...args: never[]) => unknown> = { estimateTokens, noteClasses, needTokens, shortTokens, fitIn, parseSize, parseWindows, percent };

describe('golden vectors (packages/spec/vectors/token-budget-map.json)', () => {
	it('has cases', () => {
		expect(vectors.cases.length).toBeGreaterThanOrEqual(8);
	});
	for (const c of vectors.cases) {
		it(c.name, () => {
			const fn = fns[c.fn];
			expect(fn).toBeTypeOf('function');
			expect(fn!(...(c.args as never[]))).toEqual(c.expected);
		});
	}
});
