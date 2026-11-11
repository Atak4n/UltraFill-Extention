// Akıcılık: saf fonksiyonlar + content.js entegrasyonu (sahte DOM / sahte WebGL). Gerçek shader doğruluğu burada test EDİLMEZ.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { withAttrs } from './attrs.mjs';
const req = createRequire(import.meta.url);
req('../core.js'); req('../fluid.js');
const F = globalThis.UltraFillFluid, C = globalThis.UltraFillCore;

// --- saf fonksiyonlar ---
assert.equal(F.interpT(100, 100, 41.7), 0); assert.equal(F.interpT(120.85, 100, 41.7).toFixed(2), '0.50');
assert.equal(F.interpT(500, 100, 41.7), 1, 't üst sınır 1'); assert.equal(F.interpT(50, 100, 41.7), 0, 't alt sınır 0'); assert.equal(F.interpT(10, 0, 0), 1);
assert.equal(F.estimateFps([1 / 24, 1 / 24, 1 / 24]).toFixed(0), '24'); assert.equal(F.estimateFps([]), 0); assert.equal(F.estimateFps([0, -1, NaN]), 0);
assert.equal(F.estimateFps([0.0417, 0.0417, 0.0833, 0.0417]).toFixed(0), '24', 'ortanca: düşen kare etkilemez');
assert.equal(F.estimateHz(Array(30).fill(1000 / 144.2)), 144); assert.equal(F.estimateHz(Array(30).fill(16.7)), 60); assert.equal(F.estimateHz([16]), 60, 'az örnek -> 60');
assert.equal(F.estimateHz([...Array(25).fill(1000 / 120), ...Array(5).fill(30)]), 120, 'yavaş kareler yok sayılır');
assert.equal(F.budgetMs(144).toFixed(2), '6.94'); assert.equal(F.budgetMs(0).toFixed(2), '16.67');
assert.equal(F.latencyMs(24).toFixed(1), '41.7'); assert.equal(F.latencyMs(0), 0);
assert.deepEqual(F.decideQuality({ pref: 'auto', canHigh: true, ms: 3, budget: 6.9 }), { quality: 'high', over: false });
assert.deepEqual(F.decideQuality({ pref: 'auto', canHigh: true, ms: 9, budget: 6.9 }), { quality: 'low', over: true });
assert.deepEqual(F.decideQuality({ pref: 'high', canHigh: true, ms: 9, budget: 6.9 }), { quality: 'low', over: true });
assert.deepEqual(F.decideQuality({ pref: 'low', canHigh: true, ms: 1, budget: 6.9 }), { quality: 'low', over: false });
assert.deepEqual(F.decideQuality({ pref: 'high', canHigh: false, ms: 1, budget: 6.9 }), { quality: 'low', over: false }, 'WebGL1: yüksek yok');
assert.deepEqual(F.capSize(1280, 720, 1), [1280, 720]); assert.deepEqual(F.capSize(1280, 720, 3), [2560, 1440], 'DPR<=2'); assert.deepEqual(F.capSize(3840, 2160, 2), [2560, 1440]);
assert.deepEqual(F.capSize(3440, 1440, 1), [2560, 1072], 'oran korunur');
// ayarlar: varsayılan kapalı, profiller dokunmaz
assert.equal(C.normalize({}).fluid, false); assert.equal(C.normalize({}).fluidQuality, 'auto'); assert.equal(C.normalize({ fluid: 1, fluidQuality: 'x' }).fluid, false);
assert.equal(C.normalize({ fluid: true, fluidQuality: 'high' }).fluidQuality, 'high');
for (const p of Object.values(C.PROFILES)) assert.ok(!('fluid' in p) && !('fluidQuality' in p), 'profil akıcılığa dokunmaz');
assert.equal(C.matchProfile(C.normalize({ ...C.PROFILES.sport, fluid: true })), 'sport');

// --- entegrasyon ---
const sources = ['fluid.js', 'content.js'].map(f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const style = () => { const v = new Map(); return { setProperty: (k, x) => v.set(k, x), getPropertyValue: k => v.get(k) || '', getPropertyPriority: () => '', removeProperty: k => v.delete(k) }; };
function fakeGl(log, { shaderOk = true } = {}) {
  const consts = new Map(); let n = 100;
  const k = name => { if (!consts.has(name)) consts.set(name, name === 'NO_ERROR' ? 0 : n++); return consts.get(name); };
  return new Proxy({}, { get: (_, key) => {
    if (typeof key !== 'string') return undefined;
    if (/^[A-Z0-9_]+$/.test(key)) return k(key);
    if (key === 'getError') return () => 0;
    if (key === 'getShaderParameter') return () => shaderOk;
    if (key === 'getProgramParameter') return () => true;
    if (key === 'checkFramebufferStatus') return () => k('FRAMEBUFFER_COMPLETE');
    if (key === 'getExtension') return () => null;
    return (...a) => { log.push(key); return {}; };
  } });
}
async function scene({ settings, drm = false, webgl = true, shaderOk = true }) {
  const rect = { width: 2100, height: 900, top: 0, left: 0, bottom: 900, right: 2100 };
  const parent = withAttrs({ style: style(), clientWidth: 2100, clientHeight: 900, scrollLeft: 0, scrollTop: 0, getBoundingClientRect: () => rect });
  const events = new Map(), glog = [], canvases = [], raf = [];
  const video = withAttrs({ style: style(), parentElement: parent, isConnected: true, paused: false, ended: false, readyState: 4, currentTime: 0, playbackRate: 1, videoWidth: 1920, videoHeight: 1080, mediaKeys: drm ? {} : null, getBoundingClientRect: () => rect, after() {}, addEventListener: (nm, f) => events.set(nm, f), removeEventListener() {} }, 'video');
  const mk = () => {
    const l = {}; const gl = fakeGl(glog, { shaderOk });
    const c = { style: {}, removed: false, listeners: l, setAttribute() {}, addEventListener: (nm, f) => { l[nm] = f; }, removeEventListener() {}, remove() { c.removed = true; }, getContext: () => (webgl ? gl : null) };
    canvases.push(c); return c;
  };
  let storageListener, current = settings; const reports = [];
  const api = { runtime: { sendMessage: async m => reports.push(m) }, storage: { local: { get: async () => current }, onChanged: { addListener: fn => { storageListener = fn; } } } };
  const context = vm.createContext({ chrome: api, console, performance: { now: () => 0 }, document: { hidden: false, documentElement: {}, createElement: mk, querySelectorAll: () => [video], addEventListener() {} }, getComputedStyle: () => ({ position: 'static', zIndex: 'auto', display: 'block', visibility: 'visible' }), ResizeObserver: class { observe() {} disconnect() {} }, MutationObserver: class { observe() {} disconnect() {} }, queueMicrotask, addEventListener() {}, setInterval() {}, requestAnimationFrame: fn => { raf.push(fn); return raf.length; }, cancelAnimationFrame() {}, innerHeight: 1000, innerWidth: 2200, devicePixelRatio: 1, UltraFillMapping: { coefficient: () => .75 }, UltraFillCore: C });
  for (const s of sources) vm.runInContext(s, context);
  const tick = async () => { await new Promise(r => setImmediate(r)); };
  await tick();
  const set = async patch => { current = patch; storageListener({ mode: {} }, 'local'); await tick(); };
  const run = () => { const q = raf.splice(0); q.forEach(fn => fn(16)); };
  return { video, canvases, reports, set, run, glog, events, last: () => reports.at(-1).info };
}

{ const t = await scene({ settings: { mode: 'stretch' } });
  assert.equal(t.canvases.length, 0, 'kapalıyken canvas kurulmaz'); assert.equal(t.video.getAttribute('data-uf-hide'), null); }
{ const t = await scene({ settings: { mode: 'flex', fluid: true }, drm: true });
  assert.equal(t.canvases.length, 0, 'DRM: canvas yok'); assert.match(t.last().fluid.reason, /^DRM/); assert.equal(t.last().fluid.active, false); assert.equal(t.video.getAttribute('data-uf-fit'), '', 'CSS doldurmaya döner'); }
{ const t = await scene({ settings: { mode: 'flex', fluid: true }, webgl: false });
  assert.ok(t.canvases.every(c => c.removed), 'WebGL yok: canvas temizlenir'); assert.match(t.last().fluid.reason, /WebGL/); assert.equal(t.video.getAttribute('data-uf-fit'), '', 'CSS doldurma'); assert.equal(t.video.getAttribute('data-uf-hide'), null); }
{ const t = await scene({ settings: { mode: 'flex', fluid: true }, shaderOk: false });
  assert.ok(t.canvases.every(c => c.removed), 'shader hatası: geri düşüş'); assert.match(t.last().fluid.reason, /Shader/); assert.equal(t.video.getAttribute('data-uf-fit'), ''); }
{ const t = await scene({ settings: { mode: 'off', fluid: true } });
  assert.equal(t.canvases.length, 0, 'off modunda akıcılık çalışmaz'); assert.equal(t.last().fluid.enabled, false); }
{ const t = await scene({ settings: { mode: 'flex', fluid: true } });
  assert.equal(t.canvases.length, 1); assert.equal(t.last().fluid.active, true, 'motor kuruldu'); assert.equal(t.video.getAttribute('data-uf-hide'), null, 'ilk kareden önce video gizlenmez');
  t.run(); // ilk rAF: kare yoksa çizim olmayabilir; video kare yükleyene dek bekler
  t.video.currentTime = 1 / 24; t.run(); t.run();
  assert.equal(t.canvases[0].style.visibility, 'visible', 'ilk çizim sonrası canvas görünür'); assert.equal(t.video.getAttribute('data-uf-hide'), '', 'video yalnız ilk çizimden sonra gizlenir');
  assert.ok(t.glog.includes('drawArrays'));
  await t.set({ mode: 'stretch', fluid: false });
  assert.ok(t.canvases[0].removed, 'kapatınca canvas kaldırıldı'); assert.equal(t.video.getAttribute('data-uf-hide'), null, 'data-uf-hide temizlendi'); }
{ const t = await scene({ settings: { mode: 'flex', fluid: true } });
  t.video.currentTime = 0.04; t.run();
  t.canvases[0].listeners.webglcontextlost({ preventDefault() {} }); await new Promise(r => setImmediate(r));
  assert.ok(t.canvases[0].removed && t.canvases.length === 1, 'bağlam kaybı: canvas kalktı, yeniden denenmez'); assert.match(t.last().fluid.reason, /bağlam/); assert.equal(t.video.getAttribute('data-uf-hide'), null); }
console.log('PASS fluid: saf fonksiyonlar, ayarlar/profiller, kapalı/DRM/WebGL yok/shader hatası/off/kapatma/bağlam kaybı');

for (const [w,h] of [[1920,1080],[1366,768],[853,479],[16,9],[3440,1440]]) {
  const size = F.analysisSize(w,h);
  for (const n of size) { assert.equal(n % 8, 0); assert.ok(n >= 16); }
  assert.ok(size[0] <= 480);
}
assert.equal(F.frameT(0.2,60,60),1);
assert.equal(F.frameT(0.2,54,60),1);
assert.equal(F.frameT(0.2,53.9,60),0.2);
assert.equal(F.frameT(0.2,24,60),0.2);
assert.equal(F.frameT(0.2,60,120),0.2);
assert.equal(F.bypassInterpolation(0,60),false);
assert.equal(F.snapT(0.3,'low'),0,'düşük kalite: en yakın kareye yuvarla (çift görüntü önlenir)');
assert.equal(F.snapT(0.7,'low'),1);
assert.equal(F.snapT(0.3,'high'),0.3,'yüksek kalitede yuvarlama yok');
{ const t = await scene({ settings: { mode: 'stretch', fluid: true } });
  assert.equal(t.canvases.length,1,'stretch modunda da akıcılık kurulur'); assert.equal(t.last().fluid.enabled,true); assert.equal(t.last().fluid.active,true); }
