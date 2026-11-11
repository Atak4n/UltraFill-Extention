// Kapsam: popup.js sahte DOM'da hatasız kurulur; panel paylaşılan koddan gelir; profiller (Kapalı dahil) ve "Özel" davranışı; durum yoksa "—".
import assert from 'node:assert/strict';
import { makeDoc, makeEnv } from './fakedom.mjs';
const files = ['core.js', 'panel.js', 'popup.js'];
const results = [];
const check = async (name, fn) => { try { await fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message.split('\n')[0]]); } };
const all = (n, p, out = []) => { if (p(n)) out.push(n); n.children.forEach(c => all(c, p, out)); if (n.shadowRoot) all(n.shadowRoot, p, out); return out; };
const text = n => n.textContent ?? '';
async function scene({ storage = { mode: 'stretch' }, status = [], failStatus = false } = {}) {
  const doc = makeDoc(440, 600);
  const app = doc.createElement('div'); app.setAttribute('id', 'app'); doc.body.append(app);
  const env = makeEnv({ files, doc, storage, status });
  if (failStatus) { env.ctx.chrome.tabs.query = async () => { throw new Error('izin yok'); }; }
  await env.flush(); await env.flush(); await env.flush();
  const find = p => all(app, p);
  const byText = (tag, label) => find(e => e.localName === tag && text(e) === label)[0];
  const profileBtns = () => find(e => e.localName === 'button' && e.hasAttribute('aria-pressed') && e.className === 'chip');
  const click = async el => { el.dispatch('click'); await env.flush(); };
  const flushStore = async () => { env.tick(300); await env.flush(); };
  const slider = key => find(e => e.localName === 'input' && e.getAttribute('id') === `r-${key}`)[0];
  return { env, app, find, byText, profileBtns, click, flushStore, slider, doc };
}
const frame = { active: true, frameId: 0, host: 'www.youtube.com', mode: 'stretch', info: { active: true, effective: 'stretch', reason: 'DRM/EME: yalnız doğrusal germe', video: { ratio: '16:9', resolution: '1920×1080' } } };

await check('B1 popup kurulur: panel (4 sekme + ayar) paylaşılan koddan çizilir, hata yok', async () => {
  const t = await scene({ status: [frame] });
  assert.equal(t.find(e => e.getAttribute?.('role') === 'tab').length, 4);
  assert.ok(t.find(e => e.className === 'panel inline').length === 1);
  const notes = t.find(e => e.className === 'note').map(text).join('|');
  assert.ok(notes.includes('DRM/EME'), 'DRM durumu gösterilir');
  assert.ok(notes.includes('1920×1080 · 16:9'), 'video bilgisi gösterilir');
});
await check('B2 durum alınamazsa "—" gösterir, hata fırlatmaz', async () => {
  const t = await scene({ failStatus: true });
  assert.equal(t.find(e => e.getAttribute?.('role') === 'tab').length, 4);
  assert.ok(t.find(e => e.className === 'note').map(text).includes('Video: —'));
  await t.click(t.find(e => e.className === 'gear')[0]);
  assert.ok(t.find(e => e.localName === 'span').map(text).join('').includes('(—)'), 'host yok → —');
});
await check('B3 değişiklik storage.local\'a yazılır; site geçersiz kılması host ile', async () => {
  const t = await scene({ status: [frame] });
  const z = t.slider('zoom'); z.value = '150'; z.dispatch('input'); await t.flushStore();
  assert.equal(t.env.store.zoom, 1.5);
  await t.click(t.find(e => e.className === 'gear')[0]);
  const box = t.find(e => e.localName === 'input' && e.getAttribute('type') === 'checkbox')[0];
  box.checked = true; box.dispatch('change'); await t.flushStore();
  assert.ok(t.env.store.sites?.['www.youtube.com'], 'site kaydı');
});
await check('C1 profiller: Kapalı, Film, Spor, Oyun, Müzik; hiç profil yokken nötr → Kapalı işaretli', async () => {
  const t = await scene({ status: [frame] });
  await t.click(t.find(e => e.getAttribute?.('id') === 't-profiles')[0]);
  assert.deepEqual(t.profileBtns().map(text), ['Kapalı', 'Film', 'Spor', 'Oyun', 'Müzik']);
  assert.deepEqual(t.profileBtns().map(b => b.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false', 'false']);
});
await check('C2 profil seçimi işaretli kalır; Kapalı nötre döner, mod/zoom korunur; elle değişiklik → Özel', async () => {
  const t = await scene({ storage: { mode: 'flex', zoom: 1.5 }, status: [frame] });
  await t.click(t.find(e => e.getAttribute?.('id') === 't-profiles')[0]);
  await t.click(t.byText('button', 'Film'));
  await t.flushStore();
  assert.equal(t.env.store.contrast, 10);
  assert.deepEqual(t.profileBtns().map(b => b.getAttribute('aria-pressed')), ['false', 'true', 'false', 'false', 'false']);
  await t.click(t.byText('button', 'Kapalı'));
  await t.flushStore();
  assert.equal(t.env.store.contrast, 0);
  assert.equal(t.env.store.mode, 'flex'); assert.equal(t.env.store.zoom, 1.5);
  assert.equal(t.profileBtns()[0].getAttribute('aria-pressed'), 'true');
  await t.click(t.byText('button', 'Müzik'));
  await t.click(t.find(e => e.getAttribute?.('id') === 't-image')[0]);
  const s = t.slider('brightness'); s.value = '17'; s.dispatch('input'); await t.flushStore();
  assert.ok(t.find(e => e.className === 'ts').map(text).includes('Özel'), 'sekme alt yazısı Özel');
  await t.click(t.find(e => e.getAttribute?.('id') === 't-profiles')[0]);
  assert.ok(t.profileBtns().every(b => b.getAttribute('aria-pressed') === 'false'), 'hiçbir profil işaretli değil');
});

for (const [name, ok, why] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -- ${why}`}`);
if (results.some(r => !r[1])) process.exit(1);
console.log(`PASS popup: ${results.length} senaryo`);
