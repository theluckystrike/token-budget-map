// Token estimate without a bundled tokenizer (BRIEF.md, "Tokenizer decision").
// The text is split the way BPE tokenizers pre-split it: letter runs, number runs, punctuation runs and whitespace.
// Each piece gets a token cost. On 50 held-out notes the error against o200k_base was 4.7 % mean absolute
// and -0.9 % on the sum. The count is an estimate for every model, and the UI says so.

/** A letter run of this length or shorter costs 1 token. Most English words are one token. */
export const SHORT_WORD = 10;
/** Characters per token for a longer letter run. */
export const LONG_WORD_CHARS = 5;
/** Characters per token for a run of letters outside A to Z (accents, Cyrillic, Greek and similar). */
export const OTHER_LETTER_CHARS = 2;
/** Digits per token. BPE tokenizers split numbers into groups of 1 to 3 digits. */
export const DIGIT_CHARS = 3;
/** Characters per token for a run of punctuation or symbols. */
export const PUNCT_CHARS = 3;

const LETTER = /\p{L}/u;
const NUMBER = /\p{N}/u;
const SPACE = /\s/u;

const enum Kind {
	None,
	Ascii,
	Other,
	Digit,
	Newline,
	Blank,
	Punct,
}

function isWide(cp: number): boolean {
	// Han, kana and Hangul. Each character costs WIDE_COST.
	return (
		(cp >= 0x3040 && cp <= 0x30ff) ||
		(cp >= 0x3400 && cp <= 0x4dbf) ||
		(cp >= 0x4e00 && cp <= 0x9fff) ||
		(cp >= 0xac00 && cp <= 0xd7af) ||
		(cp >= 0x1100 && cp <= 0x11ff) ||
		(cp >= 0x3130 && cp <= 0x318f) ||
		(cp >= 0xf900 && cp <= 0xfaff) ||
		(cp >= 0x20000 && cp <= 0x3134f)
	);
}

function cost(kind: Kind, len: number): number {
	switch (kind) {
		case Kind.Ascii:
			return len <= SHORT_WORD ? 1 : Math.ceil(len / LONG_WORD_CHARS);
		case Kind.Other:
			return Math.ceil(len / OTHER_LETTER_CHARS);
		case Kind.Digit:
			return Math.ceil(len / DIGIT_CHARS);
		case Kind.Newline:
			return 1;
		case Kind.Blank:
			return len > 1 ? 1 : 0;
		case Kind.Punct:
			return Math.ceil(len / PUNCT_CHARS);
		default:
			return 0;
	}
}

/** Cost of one Han, kana or Hangul character. Common words of 2 or 3 characters are often one token. */
export const WIDE_COST = 0.7;
/** Cost of one emoji or pictograph outside the BMP (U+1F000 and up). */
export const EMOJI_COST = 2;
/** Cost of a symbol in U+2600 to U+27BF (check marks, hearts, stars). */
export const SYMBOL_COST = 1;
/** Base64 text, for example an image in a data URI, costs one token per this many characters. */
export const BASE64_CHARS = 1.5;
/** A run of base64 characters this long or longer, with upper case, lower case and digits, counts as base64. */
export const BASE64_MIN = 40;

// Base64 and base64url (JWT parts, which a dot splits). A run needs upper case, lower case and digits.
const BASE64 = /[A-Za-z0-9+/_-]{40,}={0,2}/g;
const HAS_DIGIT = /[0-9]/;
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;

/** Extra cost of a code point that is not a letter, digit or space, or null for plain punctuation. */
function symbolCost(cp: number): number | null {
	if (cp === 0x200d) return 1; // zero width joiner inside emoji sequences
	if (cp >= 0xfe00 && cp <= 0xfe0f) return 0; // variation selectors
	if (cp >= 0x1f3fb && cp <= 0x1f3ff) return 1; // skin tones
	if (cp >= 0x1f000 && cp <= 0x1faff) return EMOJI_COST;
	if (cp >= 0x2600 && cp <= 0x27bf) return SYMBOL_COST;
	return null;
}

/** Estimate of text[from, to) as a fraction. Linear, no allocation per character. */
function estimateRange(text: string, from: number, to: number): number {
	let total = 0;
	let kind: Kind = Kind.None;
	let len = 0;
	let i = from;
	while (i < to) {
		let c = text.charCodeAt(i);
		let step = 1;
		let next: Kind;
		if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90)) {
			// A letter run that started outside A to Z keeps going through A to Z letters.
			next = kind === Kind.Other ? Kind.Other : Kind.Ascii;
		} else if (c >= 48 && c <= 57) {
			next = Kind.Digit;
		} else if (c === 10) {
			next = Kind.Newline;
		} else if (c === 32 || c === 9) {
			next = Kind.Blank;
		} else if (c < 128) {
			next = c < 32 || c === 127 ? Kind.None : Kind.Punct;
			if (c === 13 || c === 11 || c === 12) next = Kind.None;
		} else {
			if (c >= 0xd800 && c <= 0xdbff && i + 1 < to) {
				const cp = text.codePointAt(i) ?? c;
				if (cp > 0xffff) {
					c = cp;
					step = 2;
				}
			}
			const ch = step === 2 ? text.slice(i, i + 2) : text[i]!;
			const wide = isWide(c);
			const sym = wide ? null : symbolCost(c);
			if (wide || sym !== null) {
				if (len > 0) total += cost(kind, len);
				total += wide ? WIDE_COST : sym!;
				kind = Kind.None;
				len = 0;
				i += step;
				continue;
			} else if (LETTER.test(ch)) next = Kind.Other;
			else if (NUMBER.test(ch)) next = Kind.Digit;
			else if (SPACE.test(ch)) next = Kind.None;
			else next = Kind.Punct;
		}
		if (next === Kind.None) {
			if (len > 0) total += cost(kind, len);
			kind = Kind.None;
			len = 0;
		} else if (next === kind) {
			len += step;
		} else {
			if (len > 0) total += cost(kind, len);
			kind = next;
			len = step;
		}
		i += step;
	}
	if (len > 0) total += cost(kind, len);
	return total;
}

/** True when a run looks like base64 data and not like a long word or a path. */
export function isBase64Run(run: string): boolean {
	return run.length >= BASE64_MIN && HAS_DIGIT.test(run) && HAS_UPPER.test(run) && HAS_LOWER.test(run);
}

/** Estimated token count of a text. Linear in the text length. Base64 runs get their own cost. */
export function estimateTokens(text: string): number {
	let total = 0;
	let at = 0;
	BASE64.lastIndex = 0;
	for (let m = BASE64.exec(text); m; m = BASE64.exec(text)) {
		if (!isBase64Run(m[0])) continue;
		total += estimateRange(text, at, m.index);
		total += Math.ceil(m[0].length / BASE64_CHARS);
		at = m.index + m[0].length;
	}
	total += estimateRange(text, at, text.length);
	return Math.round(total);
}

/** Formats a count with thousands separators, the same on every system locale. */
export function formatTokens(n: number): string {
	return Math.round(n).toLocaleString('en-US');
}

/** Short form for tight places, for example 12.3k or 1.2M. */
export function shortTokens(n: number): string {
	if (n < 1000) return String(Math.round(n));
	if (n < 1_000_000) return `${trim1(n / 1000)}k`;
	return `${trim1(n / 1_000_000)}M`;
}

function trim1(x: number): string {
	const s = x.toFixed(1);
	return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** True when the text holds a base64 or base64url run (a data URI image, a key or a JWT part). */
export function hasBase64(text: string): boolean {
	BASE64.lastIndex = 0;
	for (let m = BASE64.exec(text); m; m = BASE64.exec(text)) if (isBase64Run(m[0])) return true;
	return false;
}
