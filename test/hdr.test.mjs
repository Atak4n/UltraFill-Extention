import assert from 'node:assert/strict';
import '../core.js';
const c = globalThis.UltraFillCore;
// --- HDR eğrisi ---
for (const s of [0, 1, 25, 50, 100]) {
  const { values } = c.hdrCurve(s);
  assert.equal(values[0], 0); assert.equal(values.at(-1), 1);
  for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1], `monoton s=${s}`);
}
const id = c.hdrCurve(0); assert.deepEqual(id.values, id.values.map((_, i) => +(i / (id.values.length - 1)).toFixed(4))); assert.equal(id.sat, 1);
assert.ok(c.hdrCurve(100).values[11] > c.hdrCurve(0).values[11], 'parlak tonlar açılır');
assert.ok(c.hdrCurve(100).values[2] - c.hdrCurve(0).values[2] < 0.02, 'gölgeler korunur');
const off = c.normalize({}); assert.equal(c.filterCss(off, 'x'), ''); assert.ok(c.imageNeutral(off));
assert.ok(c.imageNeutral(c.normalize({ hdr: true, hdrStrength: 0 })));
const on = c.normalize({ hdr: true, hdrStrength: 40 }); assert.ok(!c.imageNeutral(on)); assert.equal(c.filterCss(on, 'x'), 'url(#x)');
assert.equal(c.matchProfile(c.normalize(c.PROFILES.film)), 'film'); assert.equal(c.matchProfile(c.normalize(c.PROFILES.music)), 'music');
assert.equal(c.matchProfile(c.normalize({})), 'off');

console.log('PASS HDR');
