// A hatası: YouTube'da video geçişinde bayat/küçük kutu. Kök neden: restore() kaydedilmiş ESKİ satır içi değerleri
// geri yazar (sayfanın araya yazdığı yeni değerleri ezer). Kullanım: node test/stale.test.mjs [eski-content.js yolu]
import assert from 'node:assert/strict';
import { makeDoc, makeEnv } from './fakedom.mjs';
const oldPath = process.argv[2];
const files = oldPath ? ['mapping.js'] : ['mapping.js', 'core.js', 'effects.js', 'panel.js', 'content.js'];
const results = [];
const check = async (name, fn) => { try { await fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message.split('\n')[0]]); } };

// Sayfa (YouTube) satır içi stili düz atama ile yazar: !important'ı eziyor.
const pageWrite = (el, props) => Object.entries(props).forEach(([k, v]) => el.style.setProperty(k, v, ''));
async function scene(initial) {
  const doc = makeDoc(3440, 1440);
  const player = doc.createElement('div'); player.setAttribute('id', 'movie_player'); player.setAttribute('class', 'html5-video-player'); player._base = { left: 0, top: 0, width: 3440, height: 1440 };
  const box = doc.createElement('div'); box.setAttribute('class', 'html5-video-container'); box._base = { ...player._base };
  const video = doc.createElement('video');
  Object.assign(video, { isConnected: true, paused: true, ended: false, readyState: 4, videoWidth: 1920, videoHeight: 1080, mediaKeys: null });
  player.append(box); box.append(video); doc.body.append(player);
  pageWrite(video, initial);
  const env = makeEnv({ files, doc, storage: { mode: 'stretch' }, contentPath: oldPath });
  await env.flush(); await env.flush();
  return { env, video, box, player, doc, width: () => video.getBoundingClientRect().width, put: v => v.style.getPropertyValue('width') };
}
// Sitenin satır içi stili (bizim --uf-* değişkenlerimiz hariç).
const inline = el => [...el.style.map].filter(([k]) => !k.startsWith('--uf-')).map(([k, [v, p]]) => `${k}:${v}${p ? '!' + p : ''}`).join(';');
const letterboxed = { width: '1920px', height: '1080px', left: '760px', top: '180px' };

await check('A1 kök neden: emptied+kapatma sayfanın yeni değerini bayat eski değerle ezmez', async () => {
  const t = await scene(letterboxed);
  assert.equal(t.width(), 3440, 'önkoşul: kutu genişletildi');
  pageWrite(t.video, { width: '1440px', height: '1080px', left: '1000px', top: '180px' }); // sonraki video 4:3
  t.video.dispatch('emptied'); await t.env.flush();
  await t.env.ctx.chrome.storage.local.set({ mode: 'off' }); await t.env.flush();
  assert.equal(t.put(t.video), '1440px', 'sayfanın son değeri korunmalı (eski kod 1920px yazar)');
});
await check('A2 kutu sayfa tarafından yeniden yazılınca yerinde yeniden doldurulur', async () => {
  const t = await scene(letterboxed);
  pageWrite(t.video, { width: '1440px', left: '1000px' }); await t.env.flush();
  assert.equal(t.width(), 3440);
});
await check('A3 attach anında hedefi kaplıyor, sonra kutu daralınca (loadedmetadata/resize) yeniden değerlendirilir', async () => {
  const t = await scene({ width: '3440px', height: '1440px', left: '0px', top: '0px' });
  assert.equal(t.video.style.getPropertyPriority('width'), '', 'önkoşul: dokunulmadı');
  t.video.style.map.set('width', ['1440px', '']); t.video.style.map.set('left', ['1000px', '']); // MutationObserver tetiklemeden (yalnız olay)
  t.video.dispatch('loadedmetadata'); await t.env.flush();
  assert.equal(t.width(), 3440, 'loadedmetadata sonrası doldurulmalı');
  t.video.style.map.set('width', ['1000px', '']); t.video.style.map.set('left', ['500px', '']);
  t.env.resizeAll(); await t.env.flush();
  assert.equal(t.width(), 3440, 'ResizeObserver sonrası doldurulmalı');
});
await check('A4 emptied sırasında sök-tak yok: stil hiçbir an özgün değere dönmez', async () => {
  const t = await scene(letterboxed);
  const before = inline(t.video);
  t.video.dispatch('emptied'); // eşzamanlı: mikro görev çalışmadan
  assert.equal(t.video.getAttribute('data-uf'), 'fill', 'emptied içinde cleanup yapılmamalı: öznitelik yerinde');
  assert.equal(inline(t.video), before, 'sitenin satır içi stili hiç değişmedi');
});

// Kök neden (1.1.0 -> 1.1.1): fill() 'inset'/'margin' kısaltmalarını yazıyordu; kısaltma sitenin satır içi left/top değerlerini ezer
// ve söküm sırasında yalnız kısaltma silinir -> left/top kaybolur, video sola yapışır. Sahte CSSOM bu kısaltma davranışını modeller.
await check('A5 off: video kutusu özgün (ortalı) konumuna döner, atalarda stil kalmaz', async () => {
  const t = await scene(letterboxed);
  assert.equal(t.width(), 3440, 'önkoşul: kutu genişletildi');
  await t.env.ctx.chrome.storage.local.set({ mode: 'off' }); await t.env.flush(); await t.env.flush();
  const r = t.video.getBoundingClientRect();
  assert.equal(r.left, 760, 'sol boşluk = sağ boşluk (ortalı)'); assert.equal(r.top, 180);
  assert.equal(r.left + r.width, 3440 - 760, 'sağ kenar simetrik');
  for (const p of ['left', 'top', 'width', 'height', 'position', 'right', 'bottom', 'margin-left']) {
    const want = { left: '760px', top: '180px', width: '1920px', height: '1080px' }[p] ?? '';
    assert.equal(t.video.style.getPropertyValue(p), want, `video ${p}`);
  }
  for (const el of [t.box, t.player]) assert.equal(el.style.map.size, 0, `ata (${el.getAttribute('class')}) stilsiz olmalı`);
  for (const el of [t.video, t.box, t.player]) assert.deepEqual([...el.attrs.keys()].filter(k => k.startsWith('data-uf')), [], 'data-uf* öznitelikleri kaldırıldı');
});

// 1.1.2 kök neden: YouTube satır içi width/height/left/top yazar, yalnız oynatıcı boyutu değişince yeniden yazar. Biz hiç yazmadığımız için
// kapatınca left (256px) kaybolmamalı.
await check('A6 YouTube benzeri: stretch -> off sonrası left korunur, satır içi stil birebir aynı; site yazımı doldurmayı bozmaz', async () => {
  const yt = { width: '1488px', height: '837px', left: '256px', top: '0px' };
  const t = await scene(yt);
  const before = inline(t.video);
  assert.equal(t.width(), 3440, 'önkoşul: stretch dolduruyor');
  assert.equal(t.video.getAttribute('data-uf'), 'fill'); assert.notEqual(t.video.getAttribute('data-uf-fit'), null);
  pageWrite(t.video, { width: '1200px', height: '675px', left: '300px', top: '10px' }); await t.env.flush(); // site yeniden yazar
  assert.equal(t.video.getAttribute('data-uf'), 'fill', 'öznitelik yerinde kaldı'); assert.equal(t.width(), 3440, 'doldurma bozulmadı');
  pageWrite(t.video, yt); await t.env.flush();
  await t.env.ctx.chrome.storage.local.set({ mode: 'off' }); await t.env.flush(); await t.env.flush();
  assert.equal(t.video.style.getPropertyValue('left'), '256px'); assert.equal(inline(t.video), before, 'satır içi stil attach öncesiyle aynı');
  assert.deepEqual([...t.video.attrs.keys()].filter(k => k.startsWith('data-uf')), []);
});

for (const [name, ok, why] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -- ${why}`}`);
if (results.some(r => !r[1])) process.exit(1);
console.log(`PASS stale: ${results.length} senaryo (${oldPath ? 'ESKİ kod' : 'güncel kod'})`);
