// Küçük sahte DOM + eklenti ortamı (yalnız testler). Gerçek tarayıcı davranışının yerine geçmez.
import vm from 'node:vm';
import fs from 'node:fs';
import { css } from './attrs.mjs';

const ROOT = new URL('../', import.meta.url);
class Style {
  constructor(owner) { this.owner = owner; this.map = new Map(); }
  // Gerçek CSSOM gibi: 'inset'/'margin' kısaltması yazılınca/silinince uzun biçimler de ezilir/silinir.
  _long(k) { return k === 'inset' ? ['top', 'right', 'bottom', 'left'] : k === 'margin' ? ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'] : []; }
  setProperty(k, v, p = '') { this._long(k).forEach(l => this.map.set(l, [String(v), p])); this.map.set(k, [String(v), p]); this.owner._attr('style'); }
  getPropertyValue(k) { return this.map.get(k)?.[0] ?? ''; }
  getPropertyPriority(k) { return this.map.get(k)?.[1] ?? ''; }
  removeProperty(k) { this._long(k).forEach(l => this.map.delete(l)); this.map.delete(k); this.owner._attr('style'); }
}
export class El {
  constructor(tag, doc, nodeType = 1) {
    this.tagName = String(tag).toUpperCase(); this.localName = String(tag).toLowerCase(); this.ownerDocument = doc; this.nodeType = nodeType;
    this.children = []; this.parentNode = null; this.attrs = new Map(); this.listeners = new Map(); this.style = new Style(this); this._mos = []; this._text = '';
  }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get firstChild() { return this.children[0] ?? null; }
  get host() { return this._host; }
  get textContent() { return this.children.length ? this.children.map(c => (c.nodeType === 3 ? c.text : c.textContent) ?? '').join('') : this._text; }
  set textContent(v) { this.children = []; this._text = String(v); }
  _adopt(n) {
    if (typeof n === 'string') { const t = new El('#text', this.ownerDocument, 3); t.text = n; return t; }
    n.parentNode?.children.splice(n.parentNode.children.indexOf(n), 1);
    n.parentNode = this; return n;
  }
  append(...nodes) { nodes.forEach(n => this.children.push(this._adopt(n))); }
  appendChild(n) { this.append(n); return n; }
  insertBefore(n, ref) { const node = this._adopt(n); const at = ref ? this.children.indexOf(ref) : -1; if (at < 0) this.children.push(node); else this.children.splice(at, 0, node); return node; }
  removeChild(n) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  before(n) { this.parentNode.insertBefore(n, this); }
  after(n) { const p = this.parentNode, at = p.children.indexOf(this); p.insertBefore(n, p.children[at + 1] ?? null); }
  replaceChildren(...nodes) { this.children.forEach(c => { c.parentNode = null; }); this.children = []; this.append(...nodes); }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'class') this.className = String(v); this._attr(k); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); this._attr(k); }
  attachShadow() { this.shadowRoot = new El('#shadow', this.ownerDocument, 11); this.shadowRoot._host = this; return this.shadowRoot; }
  getRootNode() { let n = this; while (n.parentNode) n = n.parentNode; return n; }
  addEventListener(type, fn) { (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)).push(fn); }
  removeEventListener(type, fn) { const l = this.listeners.get(type); if (l) l.splice(l.indexOf(fn) >>> 0, 1); }
  dispatch(type, init = {}) {
    const ev = { type, target: this, stopped: false, defaultPrevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.defaultPrevented = true; }, composedPath: () => { const p = []; for (let n = this; n; n = n.parentNode ?? n._host) p.push(n); return p; }, ...init };
    for (let n = this; n && !ev.stopped; n = n.parentNode ?? n._host) [...(n.listeners.get(type) ?? [])].forEach(fn => fn(ev));
    return ev;
  }
  focus() { this.ownerDocument.activeElement = this; }
  _match(sel) {
    return sel.split(',').some(raw => { const t = raw.trim();
      if (t.startsWith('#')) return this.getAttribute('id') === t.slice(1);
      if (t.startsWith('.')) return (this.className ?? '').split(/\s+/).includes(t.slice(1));
      if (t.startsWith('[')) return false;
      return this.localName === t; });
  }
  matches(sel) { return this._match(sel); }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n._match(sel)) return n; return null; }
  querySelectorAll(sel) { const out = []; const walk = n => n.children.forEach(c => { if (c.nodeType === 1) { if (c._match(sel)) out.push(c); walk(c); } }); walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  getBoundingClientRect() {
    const base = this._base ?? { left: 0, top: 0, width: 0, height: 0 };
    const p = this.parentElement && this.parentElement.localName !== 'body' && this.parentElement.localName !== 'html' ? this.parentElement.getBoundingClientRect() : { left: 0, top: 0, width: this.ownerDocument.defaultView.innerWidth, height: this.ownerDocument.defaultView.innerHeight };
    const pick = (k, ref, d) => { const v = css(this, k); if (!v) return d; if (v.endsWith('%')) return ref * parseFloat(v) / 100; if (v.endsWith('px')) return parseFloat(v); return v === '0' ? 0 : d; };
    const width = pick('width', p.width, base.width), height = pick('height', p.height, base.height);
    const left = css(this, 'left') ? p.left + pick('left', p.width, 0) : base.left;
    const top = css(this, 'top') ? p.top + pick('top', p.height, 0) : base.top;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }
  get clientWidth() { return this.getBoundingClientRect().width; }
  get clientHeight() { return this.getBoundingClientRect().height; }
  _attr(name) {
    for (const { mo, opts } of this._mos) {
      if (!mo._on || !opts.attributes || (opts.attributeFilter && !opts.attributeFilter.includes(name))) continue;
      mo._queue.push({ type: 'attributes', attributeName: name, target: this });
      if (!mo._pending) { mo._pending = true; queueMicrotask(() => { mo._pending = false; const q = mo._queue.splice(0); if (q.length && mo._on) mo._cb(q, mo); }); }
    }
  }
}
export function makeDoc(width = 3440, height = 1440) {
  const doc = new El('#document', null, 9);
  doc.ownerDocument = doc; doc.defaultView = { innerWidth: width, innerHeight: height };
  doc.documentElement = new El('html', doc); doc.body = new El('body', doc);
  doc.documentElement.append(doc.body); doc.append(doc.documentElement);
  doc.createElement = tag => new El(tag, doc);
  doc.createElementNS = (ns, tag) => new El(tag, doc);
  doc.hidden = false; doc.fullscreenElement = null;
  doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel);
  doc.getElementById = id => doc.documentElement.querySelector(`#${id}`);
  return doc;
}
const scripts = names => names.map(n => fs.readFileSync(new URL(n, ROOT), 'utf8'));
// files: yüklenecek betikler (sırayla). Dönen env.ctx üzerinden zaman/gözlemci denetimi yapılır.
export function makeEnv({ files, doc = makeDoc(), storage = {}, hostname = 'www.youtube.com', contentPath, status = [] } = {}) {
  const store = { ...storage }, changeListeners = [], mos = [], ros = [], timers = [], rafs = [];
  let clock = 0, nextId = 0;
  const api = {
    runtime: { sendMessage: async m => (m?.type === 'get-status' ? status : undefined) },
    tabs: { query: async () => [{ id: 1 }] },
    storage: {
      local: {
        get: async () => ({ ...store }),
        set: async obj => { const changes = {}; for (const k of Object.keys(obj)) { changes[k] = { newValue: obj[k] }; store[k] = obj[k]; } changeListeners.forEach(fn => fn(changes, 'local')); }
      },
      onChanged: { addListener: fn => changeListeners.push(fn) }
    }
  };
  class MO { constructor(cb) { this._cb = cb; this._queue = []; this._on = true; mos.push(this); }
    observe(target, opts = {}) { this.target = target; target._mos?.push({ mo: this, opts }); }
    disconnect() { this._on = false; mos.forEach(() => {}); } trigger() { this._cb([], this); } }
  class RO { constructor(cb) { this.cb = cb; ros.push(this); } observe() {} disconnect() { this.off = true; } }
  const windowListeners = new Map();
  const ctx = vm.createContext({
    chrome: api, document: doc, console, queueMicrotask, innerWidth: doc.defaultView.innerWidth, innerHeight: doc.defaultView.innerHeight, devicePixelRatio: 1,
    location: { hostname }, MutationObserver: MO, ResizeObserver: RO, performance: { now: () => clock },
    getComputedStyle: el => ({ position: css(el, 'position') || 'static', zIndex: 'auto', display: 'block', visibility: 'visible' }),
    requestAnimationFrame: fn => { rafs.push(fn); return rafs.length; }, cancelAnimationFrame() {},
    setTimeout: (fn, ms = 0) => { timers.push({ id: ++nextId, at: clock + ms, fn }); return nextId; },
    clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn, ms) => { timers.push({ id: ++nextId, at: clock + ms, fn, every: ms }); return nextId; },
    addEventListener: (n, f) => windowListeners.set(n, f)
  });
  for (const code of scripts(files)) vm.runInContext(code, ctx);
  if (contentPath) vm.runInContext(fs.readFileSync(contentPath, 'utf8'), ctx);
  const flush = () => new Promise(r => setImmediate(r));
  return {
    ctx, doc, store, mos, ros, windowListeners, flush,
    tick(ms) { clock += ms; for (const t of [...timers].sort((a, b) => a.at - b.at)) if (t.at <= clock) { if (t.every) t.at = clock + t.every; else timers.splice(timers.indexOf(t), 1); t.fn(); } },
    frame() { rafs.splice(0).forEach(fn => fn(clock)); },
    resizeAll() { ros.filter(r => !r.off).forEach(r => r.cb([])); }
  };
}
