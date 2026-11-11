// Kapsam: (a) YouTube düğmesi tek kez/geri gelir, (b) nötr ayarlarda filter/transform yok + off temizliği, (c) stretch'te canvas yok.
import assert from 'node:assert/strict';
import { makeDoc, makeEnv } from './fakedom.mjs';
const files = ['mapping.js', 'core.js', 'effects.js', 'panel.js', 'content.js'];
const results = [];
const check = async (name, fn) => { try { await fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message.split('\n')[0]]); } };
const count = (n, p) => (p(n) ? 1 : 0) + n.children.reduce((a, c) => a + count(c, p), 0);
async function scene(storage) {
  const doc = makeDoc(3440, 1440), made = [];
  const orig = doc.createElement; doc.createElement = t => { const e = orig(t); made.push(e); return e; };
  const player = doc.createElement('div'); player.setAttribute('class', 'html5-video-player'); player._base = { left: 0, top: 0, width: 3440, height: 1440 };
  const bar = doc.createElement('div'); bar.setAttribute('class', 'ytp-right-controls');
  const video = doc.createElement('video');
  Object.assign(video, { isConnected: true, paused: true, ended: false, readyState: 4, videoWidth: 1920, videoHeight: 1080, mediaKeys: null });
  player.append(bar, video); doc.body.append(player);
  const env = makeEnv({ files, doc, storage });
  await env.flush(); await env.flush();
  return { env, doc, player, bar, video, made };
}
const yt = n => count(n, e => e.getAttribute?.('data-ultrafill') === 'yt');

await check('a) YouTube düğmesi tek kez eklenir; çubuk yeniden kurulunca geri gelir', async () => {
  const t = await scene({ mode: 'stretch' });
  assert.equal(yt(t.doc), 1, 'ilk ekleme');
  t.env.tick(2500); await t.env.flush();
  assert.equal(yt(t.doc), 1, 'çift eklenmemeli');
  const old = t.bar; old.parentNode.children.splice(old.parentNode.children.indexOf(old), 1); old.parentNode = null; // SPA: çubuk atıldı
  const bar2 = t.doc.createElement('div'); bar2.setAttribute('class', 'ytp-right-controls'); t.player.append(bar2);
  t.env.tick(2500); await t.env.flush();
  assert.equal(yt(t.doc), 1, 'yeni çubukta tek düğme');
  assert.equal(yt(bar2), 1);
});
await check('b) nötr ayarlarda filter/transform yok; off temizler', async () => {
  const t = await scene({ mode: 'stretch' });
  const before = t.doc.body.children.length;
  assert.ok(!t.video.style.getPropertyValue('filter'), 'filter kalmamalı');
  assert.ok(!t.video.style.getPropertyValue('transform'), 'transform kalmamalı');
  await t.env.ctx.chrome.storage.local.set({ mode: 'off' }); await t.env.flush(); await t.env.flush();
  for (const p of ['filter', 'transform', 'width', 'height', 'left', 'top']) assert.ok(!t.video.style.getPropertyValue(p), `off sonrası ${p} kalmamalı`);
  assert.equal(count(t.doc, e => e.tagName === 'CANVAS'), 0, 'canvas kalmamalı');
  assert.equal(count(t.doc, e => e.getAttribute?.('data-ultrafill') && e.getAttribute('data-ultrafill') !== 'yt'), 0, 'panel/ışık düğümü kalmamalı');
  assert.ok(t.doc.body.children.length <= before);
});
await check('c) stretch modunda canvas/WebGL kurulmaz', async () => {
  const t = await scene({ mode: 'stretch' });
  assert.equal(t.made.filter(e => e.tagName === 'CANVAS').length, 0);
});
await check('d) YouTube düğmesi: contextmenu/uzun basma yok, tık mod döndürür, ipucu kısa', async () => {
  const t = await scene({ mode: 'stretch' });
  const b = t.doc.querySelector('.ultrafill-yt');
  for (const type of ['contextmenu', 'pointerdown', 'pointerup', 'pointerleave', 'pointercancel']) assert.equal(b.listeners.get(type)?.length ?? 0, 0, `${type} dinleyicisi olmamalı`);
  assert.ok(!b.className.includes('ytp-button'), 'YouTube ipucu mekanizmasına bağlanmamalı');
  assert.equal(b.getAttribute('title'), 'UltraFill: Doldurma — tıkla: mod değiştir');
  assert.equal(b.getAttribute('aria-label'), b.getAttribute('title'));
  const ctx = b.dispatch('contextmenu'); assert.equal(ctx.defaultPrevented, false, 'sağ tık sitenin/tarayıcının davranışında kalır');
  t.env.tick(600); await t.env.flush(); assert.equal(t.env.store.mode, 'stretch', 'uzun basma/sağ tık mod değiştirmemeli');
  b.dispatch('click'); t.env.tick(300); await t.env.flush(); await t.env.flush();
  assert.equal(t.env.store.mode, 'flex', 'tık stretch → flex');
  assert.equal(count(t.doc, e => e.getAttribute?.('role') === 'dialog'), 0, 'oynatıcı içi panel yok');
});

for (const [name, ok, why] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -- ${why}`}`);
if (results.some(r => !r[1])) process.exit(1);
console.log(`PASS ui: ${results.length} senaryo`);
