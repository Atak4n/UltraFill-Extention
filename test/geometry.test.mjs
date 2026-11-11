import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { withAttrs } from './attrs.mjs';
const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function style() {
  const values = new Map();
  return { setProperty: (k, v, p = '') => values.set(k, [v, p]), getPropertyValue: k => values.get(k)?.[0] || '', getPropertyPriority: k => values.get(k)?.[1] || '', removeProperty: k => values.delete(k) };
}
const box = (w, h) => ({ width: w, height: h, left: 0, top: 0, bottom: h, right: w });
const el = (w, h, extra = {}) => withAttrs({ style: style(), clientWidth: w, clientHeight: h, scrollLeft: 0, scrollTop: 0, parentElement: null, getBoundingClientRect: () => box(w, h), ...extra });
// Builds: video -> parent -> wrap -> (top). options pick where fullscreen and the known player sit.
async function run({ stored = {}, fsPick = () => null, known = false, shadow = false, iframe = false, videoSize = [1920, 1080] } = {}) {
  const top = el(3440, 1440), wrap = el(1920, 1080), parent = el(1920, 1080), video = el(...videoSize); video.localName = 'video';
  const doc = { hidden: false, documentElement: el(3440, 1440), body: el(3440, 1440), fullscreenElement: null, addEventListener() {}, createElement() { throw new Error('canvas must not be created'); }, querySelectorAll: () => [video] };
  doc.documentElement.ownerDocument = doc.body.ownerDocument = top.ownerDocument = wrap.ownerDocument = parent.ownerDocument = video.ownerDocument = doc;
  top.parentElement = doc.body; wrap.parentElement = top; parent.parentElement = wrap; video.parentElement = parent;
  doc.body.parentElement = doc.documentElement;
  Object.assign(video, { isConnected: true, paused: true, ended: false, readyState: 4, videoWidth: 1920, videoHeight: 1080, addEventListener() {}, removeEventListener() {} });
  if (known) top.closest = () => top; // parent.closest finds the known container
  parent.closest = () => (known ? top : null);
  let host = null;
  if (shadow) { // video lives directly in a shadow root of `parent`
    host = parent; video.parentElement = null; const sroot = { host, ownerDocument: { createElement: () => ({}) }, append() {} }; video.getRootNode = () => sroot; // stil sayfası <style> yoluyla enjekte edilir
    doc.querySelectorAll = sel => (sel === 'video' ? [] : [Object.assign(host, { shadowRoot: { querySelectorAll: s => (s === 'video' ? [video] : []) } })]);
  }
  let outer = null;
  if (iframe) { // video's document sits in a frame of the outer document, whose fullscreen element holds the frame
    const frame = el(1920, 1080), outerTop = el(3440, 1440);
    frame.parentElement = outerTop;
    outer = { fullscreenElement: outerTop, documentElement: {}, body: {} };
    frame.ownerDocument = outer;
    doc.defaultView = { frameElement: frame };
    outerTop.contains = x => x === frame;
  }
  const picked = fsPick({ top, wrap, parent, video, doc });
  if (picked) doc.fullscreenElement = picked;
  let storageListener, settings = stored;
  const api = { runtime: { sendMessage: () => undefined }, storage: { local: { get: async () => settings }, onChanged: { addListener: fn => { storageListener = fn; } } } };
  vm.runInNewContext(source, { chrome: api, document: doc, console, queueMicrotask, innerHeight: 1440, innerWidth: 3440, devicePixelRatio: 1, UltraFillMapping: { coefficient: () => .75 }, getComputedStyle: () => ({ position: 'static', zIndex: 'auto', display: 'block', visibility: 'visible' }), MutationObserver: class { observe() {} disconnect() {} }, ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener() {}, setInterval() {} });
  await flush();
  return { top, wrap, parent, video, doc, outer, async off() { settings = { mode: 'off' }; storageListener({ mode: {} }, 'local'); await flush(); } };
}
const fit = f => f.video.style.getPropertyValue('object-fit');
const untouched = e => ['position', 'width', 'height'].every(k => e.style.getPropertyValue(k) === '');

// 1. no stored setting -> stretch, no canvas (createElement throws), linear fill
{ const f = await run({}); assert.equal(fit(f), 'fill'); await f.off(); assert.equal(fit(f), ''); }
// stored 'off' stays off
{ const f = await run({ stored: { mode: 'off' } }); assert.equal(fit(f), ''); }

// 2. video element's own fullscreen: no throw, only object-fit
{ const f = await run({ fsPick: ({ video }) => video }); assert.equal(fit(f), 'fill'); assert.ok(untouched(f.video) && untouched(f.parent)); }
{ const f = await run({ stored: { mode: 'flex' }, fsPick: ({ video }) => video }); assert.equal(fit(f), 'fill'); assert.ok(untouched(f.video)); await f.off(); assert.equal(fit(f), ''); }

// 3. fullscreen element is body/html: viewport is the target
{ const f = await run({ fsPick: ({ doc }) => doc.body }); assert.equal(fit(f), 'fill'); assert.equal(f.parent.style.getPropertyValue('width'), '100%'); assert.ok(untouched(f.doc.body)); await f.off(); assert.ok(untouched(f.parent)); }
{ const f = await run({ fsPick: ({ doc }) => doc.documentElement, videoSize: [3440, 1440] }); assert.equal(fit(f), 'fill'); assert.ok(untouched(f.parent) && untouched(f.video)); }

// 3b. regular fullscreen element: branch expanded, element itself only gets position
{ const f = await run({ fsPick: ({ top }) => top }); assert.equal(fit(f), 'fill'); assert.equal(f.wrap.style.getPropertyValue('width'), '100%'); assert.equal(f.top.style.getPropertyValue('width'), ''); await f.off(); assert.ok(untouched(f.wrap) && untouched(f.top)); }

// 3c. unknown site, not fullscreen: geometry unchanged
{ const f = await run({}); assert.ok(untouched(f.parent) && untouched(f.wrap) && untouched(f.video)); assert.equal(fit(f), 'fill'); }
// known container, not fullscreen, video letterboxed in it: expanded then restored
{ const f = await run({ known: true }); assert.equal(f.parent.style.getPropertyValue('width'), '100%'); await f.off(); assert.ok(untouched(f.parent) && untouched(f.video)); }
// known container already covered by the video: geometry untouched
{ const f = await run({ known: true, videoSize: [3440, 1440] }); assert.ok(untouched(f.parent) && untouched(f.video)); assert.equal(fit(f), 'fill'); }

// 4. video in a same-origin iframe while the outer document is fullscreen
{ const f = await run({ iframe: true }); assert.equal(fit(f), 'fill'); assert.equal(f.parent.style.getPropertyValue('width'), '100%'); assert.ok(untouched(f.doc.body)); await f.off(); assert.ok(untouched(f.parent)); }

// 5. video inside an open shadow root (no parentElement): found, no throw
{ const f = await run({ shadow: true }); assert.equal(fit(f), 'fill'); }
{ const f = await run({ shadow: true, fsPick: ({ top }) => top }); assert.equal(fit(f), 'fill'); assert.equal(f.wrap.style.getPropertyValue('width'), '100%'); await f.off(); assert.ok(untouched(f.wrap)); }

console.log('PASS geometry: default stretch, own fullscreen, html/body, iframe, shadow DOM, unknown/known container, restore');
