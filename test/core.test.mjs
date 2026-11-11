import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
createRequire(import.meta.url)('../core.js');
const c = globalThis.UltraFillCore, D = c.DEFAULTS;

// normalize: sınırlar, çöp girdi, varsayılanlar
assert.equal(c.normalize().mode, 'stretch');
assert.equal(c.normalize({ mode: 'x' }).mode, 'stretch');
assert.equal(c.normalize({ mode: 'off' }).mode, 'off');
const n = c.normalize({ zoom: 9, panX: -500, strength: 'a', brightness: 1e9, crop: '5:4' });
assert.deepEqual([n.zoom, n.panX, n.strength, n.brightness, n.crop], [3, -100, 1, 100, 'none']);
assert.equal(c.normalize({ crop: '21:9' }).crop, '21:9');
assert.equal(c.normalize({ crop: '__proto__' }).crop, 'none');

// zoom / kırpma / kaydırma
const v169 = 16 / 9;
assert.equal(c.viewTransform(D, v169), '', 'nötr ayarlar: dönüşüm yok');
assert.equal(c.viewTransform(c.normalize({ zoom: 2 }), v169), 'translate(0%, 0%) scale(2, 2)');
assert.equal(c.viewTransform(c.normalize({ crop: '21:9' }), v169), 'translate(0%, 0%) scale(1, 1.3125)', '16:9 -> 21:9: üst/alt kırp');
assert.equal(c.viewTransform(c.normalize({ crop: '4:3' }), v169), 'translate(0%, 0%) scale(1.3333, 1)', '16:9 -> 4:3: yanlardan kırp');
assert.equal(c.viewTransform(c.normalize({ crop: '16:9' }), v169), '', 'aynı oran: nötr');
assert.equal(c.viewTransform(c.normalize({ crop: '21:9' }), NaN), '', 'bilinmeyen video oranı: kırpma yok');
assert.deepEqual(c.cropScale(2.4, '21:9'), [2.4 / (21 / 9), 1], 'daha geniş video dar orana: yanlardan kırp');
// pan: ölçek 2 -> en fazla %50 kayma; sınırın ötesi kenarda durur
assert.equal(c.viewTransform(c.normalize({ zoom: 2, panX: 100 }), v169), 'translate(-50%, 0%) scale(2, 2)');
assert.equal(c.viewTransform(c.normalize({ zoom: 2, panY: -100 }), v169), 'translate(0%, 50%) scale(2, 2)');
assert.equal(c.viewTransform(c.normalize({ panX: 100 }), v169), '', 'ölçek 1: kaydırma etkisiz');
// görüntü filtresi
assert.ok(c.imageNeutral(D));
assert.equal(c.filterCss(D, 'x'), '', 'nötr: filtre tamamen kalkar');
assert.equal(c.filterCss(c.normalize({ brightness: 10 }), 'x'), 'brightness(1.1)');
assert.equal(c.filterCss(c.normalize({ contrast: -50, saturation: 20 }), 'x'), 'contrast(0.5) saturate(1.2)');
assert.equal(c.filterCss(c.normalize({ shadows: 100, brightness: 10 }), 'x'), 'url(#x) brightness(1.1)');
assert.equal(c.imageSpec(c.normalize({ shadows: 100 })).gamma, 0.5);
assert.equal(c.imageSpec(c.normalize({ shadows: -100 })).gamma, 2);
assert.equal(c.imageSpec(c.normalize({ sharpness: 50 })).sharp, 0.4);
assert.equal(c.imageSpec(D).gamma, null);
assert.ok(!c.imageNeutral(c.normalize({ sharpness: 1 })));

// oran etiketi
assert.deepEqual({ ...c.describeAspect(1920, 1080) }, { aspect: 16 / 9, ratio: '16:9', resolution: '1920×1080' });
assert.equal(c.describeAspect(1920, 800).ratio, '2.40:1');
assert.equal(c.describeAspect(2560, 1080).ratio, '21:9');
assert.equal(c.describeAspect(0, 0), null);

// profiller ve mod döngüsü
for (const [name, p] of Object.entries(c.PROFILES)) { const s = c.normalize(p); assert.equal(c.matchProfile(s), name, name); for (const k of Object.keys(p)) assert.ok(k in D, `${name}.${k} bilinen anahtar`); }
assert.deepEqual(Object.keys(c.PROFILES), ['off', 'film', 'sport', 'game', 'music'], 'liste sırası');
assert.equal(c.matchProfile(D), 'off', 'her şey nötr → Kapalı işaretli');
assert.equal(c.matchProfile({ ...D, mode: 'flex', zoom: 2, panX: 30 }), 'off', 'mod/yakınlaştırma profili etkilemez');
assert.equal(c.matchProfile({ ...D, ...c.PROFILES.film, sharpness: 11 }), null, 'elle değişiklik → profil yok (Özel)');
assert.equal(c.matchProfile({ ...D, brightness: 1 }), null, 'nötr değil → Kapalı değil');
for (const k of ['brightness', 'contrast', 'saturation', 'shadows', 'sharpness']) assert.equal(c.PROFILES.off[k], D[k], `off.${k} = varsayılan`);
assert.deepEqual(Object.keys(c.PROFILES.off).sort(), Object.keys(c.PROFILES.film).sort(), 'off yalnız profil anahtarlarını içerir (mod/zoom yok)');
assert.equal(c.effective({ mode: 'flex', sites: { 'a.com': { mode: 'off' } } }, 'a.com').mode, 'off');
assert.equal(c.effective({ mode: 'flex', sites: { 'a.com': { mode: 'off' } } }, 'b.com').mode, 'flex');
assert.deepEqual(['off', 'stretch', 'flex'].map(c.nextMode), ['stretch', 'flex', 'off']);

console.log('PASS core: normalize, zoom/crop/pan transform, image filter, aspect label, profiles');

assert.deepEqual(c.normalize({ obsoleteSetting: true }), D, 'unknown stored keys ignored');
