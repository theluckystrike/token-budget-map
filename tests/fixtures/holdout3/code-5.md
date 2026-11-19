Notes on the parser.

The function `tokenize(src)` returns a list. See below.

```js
const re0 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 0
for (const m of src.matchAll(re0)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
const re1 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 1
for (const m of src.matchAll(re1)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
const re2 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 2
for (const m of src.matchAll(re2)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
const re3 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 3
for (const m of src.matchAll(re3)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
const re4 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 4
for (const m of src.matchAll(re4)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
const re5 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 5
for (const m of src.matchAll(re5)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
const re6 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 6
for (const m of src.matchAll(re6)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
const re7 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 7
for (const m of src.matchAll(re7)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
const re8 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 8
for (const m of src.matchAll(re8)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
const re9 = /^(?<key>[a-z_]+)\s*=\s*(?<val>"[^"]*"|\d+(?:\.\d+)?)$/gm; // pattern 9
for (const m of src.matchAll(re9)) out.push([m.groups.key, JSON.parse(m.groups.val)]);
```

It fails on nested quotes.
