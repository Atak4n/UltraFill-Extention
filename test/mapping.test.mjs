import assert from 'node:assert/strict';
import '../mapping.js';
const { coefficient, mapCoordinate: u, sourceCoordinate } = globalThis.UltraFillMapping;
for (const target of [16/9, 21/9, 32/9, 1, 100]) {
  for (const strength of [0, .25, .5, 1]) {
    const k = coefficient(16/9, target, strength);
    assert.equal(u(0, k), 0);
    assert.equal(u(-1, k), -1); assert.equal(u(1, k), 1);
    assert.ok(Math.abs((u(1e-5, k) - u(-1e-5, k)) / 2e-5 - k) < 1e-8);
    let last = -Infinity;
    for (let i = 0; i <= 2000; i++) {
      const x = i / 1000 - 1, mapped = u(x, k);
      assert.ok(mapped > last); last = mapped;
      assert.ok(Math.abs(sourceCoordinate(mapped, k) - x) < .00013);
    }
    // Pixel-scale derivative: target/source * k = 1 at full strength.
    if (strength === 1 && target >= 16/9) assert.ok(Math.abs(target / (16/9) * k - 1) < 1e-10);
  }
}
for (const k of [NaN, Infinity, -1, 0, 4]) assert.equal(u(.5, k), .5);
assert.equal(coefficient(NaN, 2), 1);
assert.equal(coefficient(2, 0), 1);
assert.equal(coefficient(1, 2, -1), 1);
console.log('PASS mapping: endpoints, monotonicity, center derivative, inverse, safe fallback');
