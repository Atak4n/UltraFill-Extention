import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { withAttrs } from './attrs.mjs';
const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
function style() {
  const values = new Map();
  return { setProperty: (k,v) => values.set(k,v), getPropertyValue: k => values.get(k) || '', getPropertyPriority: () => '', removeProperty: k => values.delete(k) };
}
for (const scenario of ['no-webgl','shader','security','drm','native-controls']) {
  const rect = { width: 2100, height: 900, top: 0, left: 0, bottom: 900, right: 2100 };
  const parent = withAttrs({ style: style(), clientWidth: 2100, clientHeight: 900, scrollLeft: 0, scrollTop: 0, getBoundingClientRect: () => rect });
  const events = new Map();
  const video = withAttrs({ style: style(), parentElement: parent, isConnected: true, paused: false, ended: false, readyState: 4, videoWidth: 1920, videoHeight: 1080, controls: scenario === 'native-controls', mediaKeys: scenario === 'drm' ? {} : null, getBoundingClientRect: () => rect, after() {}, addEventListener: (n,f) => events.set(n,f), removeEventListener() {} }, 'video');
  const gl = new Proxy({}, { get: (_, key) => {
    if (key === 'getShaderParameter') return () => scenario !== 'shader';
    if (key === 'getProgramParameter') return () => true;
    if (key === 'texImage2D') return () => { const error = new Error('blocked'); error.name = 'SecurityError'; throw error; };
    return () => ({});
  } });
  const canvas = { style: {}, setAttribute() {}, addEventListener() {}, remove() {}, getContext: () => scenario === 'no-webgl' ? null : gl };
  let storageListener;
  const reports = [];
  const api = { runtime: { sendMessage: async m => reports.push(m) }, storage: { local: { get: async () => ({ mode: 'flex', strength: 1 }) }, onChanged: { addListener: fn => { storageListener = fn; } } } };
  const context = vm.createContext({ chrome: api, console, document: { hidden: false, documentElement: {}, createElement: () => canvas, querySelectorAll: () => [video], addEventListener() {} }, getComputedStyle: () => ({ position: 'static', zIndex: 'auto', display: 'block', visibility: 'visible' }), ResizeObserver: class { observe() {} disconnect() {} }, MutationObserver: class { observe() {} disconnect() {} }, queueMicrotask, addEventListener() {}, setInterval() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, innerHeight: 1000, innerWidth: 2200, devicePixelRatio: 1, UltraFillMapping: { coefficient: () => .75 } });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(video.style.getPropertyValue('object-fit'), 'fill', scenario);
  assert.equal(video.style.getPropertyValue('opacity'), '', scenario);
  assert.ok(reports.some(r => r.mode === 'stretch' && r.reason), scenario);
  api.storage.local.get = async () => ({ mode: 'off' });
  storageListener({ mode: {} }, 'local');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(video.style.getPropertyValue('object-fit'), '', 'restore after off');
  assert.equal(parent.style.getPropertyValue('position'), '', 'restore parent');
}
console.log('PASS fallback: WebGL unavailable, shader failure, SecurityError, DRM, native controls, style restore');
