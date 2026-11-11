/* UltraFill arayüz: (1) videonun üstündeki yüzen düğme (yalnız mod döndürür), (2) YouTube kontrol çubuğu düğmesi (yalnız mod döndürür),
   (3) eklenti popup'ındaki tam panel (mountInline; sekmeler, kaydırıcılar, profiller). Özgün yapıdır; üçüncü taraf kod/metin/ikon içermez.
   Hesaplar core.js'te, ayar yazımı content.js (sayfa) ve popup.js (popup) içindedir. */
(() => {
  const core = globalThis.UltraFillCore;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const MODE_LABEL = { off: 'Kapalı', stretch: 'Doldurma', flex: 'Esnek' };
  const PROFILE_LABEL = { off: 'Kapalı', film: 'Film', sport: 'Spor', game: 'Oyun', music: 'Müzik' };
  const tip = mode => `UltraFill: ${MODE_LABEL[mode]} — tıkla: mod değiştir`;
  const ICONS = {
    fab: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
    zoom: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    image: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
    profiles: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
    fluid: 'M3 12c3-7 6-7 9 0s6 7 9 0',
    gear: 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1'
  };
  const CSS = `
:host{all:initial}
*{box-sizing:border-box;font:13px/1.4 -apple-system,"SF Pro Text",system-ui,sans-serif}
.wrap{position:fixed;inset:0;pointer-events:none;color:#f5f5f7}
.fab{position:fixed;width:40px;height:40px;border-radius:50%;border:0.5px solid rgba(255,255,255,0.25);background:rgba(30,32,40,0.65);color:inherit;backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);box-shadow:0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3);display:grid;place-items:center;padding:0;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s ease, background .2s ease, transform .2s ease}
.show .fab{opacity:1;pointer-events:auto}
.fab:hover{background:rgba(50,56,70,0.8);transform:scale(1.04)}
svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.panel{position:fixed;pointer-events:auto;overflow:auto;border-radius:20px;border:0.5px solid rgba(255,255,255,0.2);background:rgba(22,24,32,0.72);backdrop-filter:blur(36px) saturate(200%);-webkit-backdrop-filter:blur(36px) saturate(200%);box-shadow:0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25);padding:12px 14px 14px;color:#f5f5f7}
.panel[hidden]{display:none}
.tabs{display:flex;align-items:stretch;gap:4px;background:rgba(0,0,0,0.2);padding:4px;border-radius:14px;border:0.5px solid rgba(255,255,255,0.1);margin-bottom:10px}
.tab,.gear{background:transparent;border:0;color:#98989d;cursor:pointer;padding:6px 10px;display:flex;flex-direction:column;align-items:center;gap:2px;border-radius:10px;min-width:0;transition:all .2s cubic-bezier(0.25, 1, 0.5, 1)}
.tab[aria-selected=true],.gear[aria-pressed=true]{background:rgba(255,255,255,0.18);color:#ffffff;box-shadow:0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3);border-bottom:0}
.tab:hover,.gear:hover{color:#ffffff;background:rgba(255,255,255,0.08)}
.tn{font-weight:600;font-size:11px;white-space:nowrap;letter-spacing:-0.01em}
.ts{font-size:10px;color:#86868b;white-space:nowrap}
.tab[aria-selected=true] .ts{color:rgba(255,255,255,0.8)}
.gear{margin-left:auto;justify-content:center;padding:6px 10px;border-radius:10px}
.sec{margin:10px 0 14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:14px;padding:10px 12px}
.sh{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.sh h3{margin:0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#86868b}
.reset,.btn,.chip{background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.14);color:#f5f5f7;border-radius:999px;padding:4px 12px;cursor:pointer;font-size:12px;transition:all .15s ease}
.reset{font-size:11px;padding:2px 10px}
.btn:hover,.reset:hover,.chip:hover{background:rgba(255,255,255,0.16);border-color:rgba(255,255,255,0.25)}
.chip[aria-checked=true],.chip[aria-pressed=true]{background:linear-gradient(135deg, #0a84ff 0%, #0062d2 100%);border-color:rgba(255,255,255,0.3);color:#fff;box-shadow:0 2px 10px rgba(10,132,255,0.35), inset 0 1px 0 rgba(255,255,255,0.3)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.row{display:grid;grid-template-columns:110px minmax(0,1fr) 56px;align-items:center;gap:8px;margin:8px 0}
.pill{background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.08);border-radius:999px;padding:3px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#d1d1d6}
output{text-align:right;font-variant-numeric:tabular-nums;color:#aeaeb2;font-size:12px}
input[type=range]{width:100%;-webkit-appearance:none;appearance:none;background:transparent;margin:0}
input[type=range]::-webkit-slider-runnable-track{height:5px;background:rgba(255,255,255,0.15);border-radius:3px;border:0.5px solid rgba(255,255,255,0.1)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:#ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.8);border:0.5px solid rgba(0,0,0,0.15);margin-top:-6.5px;transition:transform .1s ease}
input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.1)}
input:disabled{opacity:.35}
.check{display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer}
.check input[type=checkbox]{appearance:none;-webkit-appearance:none;width:36px;height:20px;background:rgba(255,255,255,0.15);border-radius:10px;position:relative;cursor:pointer;border:0.5px solid rgba(255,255,255,0.12);transition:background .2s ease}
.check input[type=checkbox]::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.2);transition:transform .2s cubic-bezier(0.25, 1, 0.5, 1)}
.check input[type=checkbox]:checked{background:#34c759;border-color:rgba(52,199,89,0.5)}
.check input[type=checkbox]:checked::after{transform:translateX(16px)}
.note{margin:6px 0 0;color:#86868b;font-size:11px;line-height:1.4}
:focus-visible{outline:2px solid #0a84ff;outline-offset:2px;border-radius:4px}
.panel.inline{position:static;overflow:visible;border:0;border-radius:0;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;padding:8px 12px 10px;color:#f5f5f7}
.panel.inline{display:flex;flex-direction:column;width:440px;max-height:600px;overflow:hidden;padding:8px 12px 10px}
.inline .tabs{flex:none;margin-bottom:6px}
.inline .tab{flex:1 1 0;min-width:0;padding:6px 4px}
.inline .tn,.inline .ts{max-width:100%;overflow:hidden;text-overflow:ellipsis}
.inline .gear{flex:none}
.inline .body{flex:1 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.2) transparent}
.inline .sec{margin:6px 0 10px}
.inline .row{margin:4px 0}
.note:empty{display:none}

@media (prefers-color-scheme: light) {
  .panel{background:rgba(255,255,255,0.78);border-color:rgba(0,0,0,0.08);color:#1d1d1f;box-shadow:0 20px 50px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9)}
  .tabs{background:rgba(0,0,0,0.04);border-color:rgba(0,0,0,0.06)}
  .tab,.gear{color:#6e6e73}
  .tab[aria-selected=true],.gear[aria-pressed=true]{background:rgba(255,255,255,0.9);color:#1d1d1f;box-shadow:0 4px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)}
  .tab:hover,.gear:hover{color:#1d1d1f;background:rgba(0,0,0,0.04)}
  .tab[aria-selected=true] .ts{color:#3a3a3c}
  .sec{background:rgba(0,0,0,0.02);border-color:rgba(0,0,0,0.05)}
  .sh h3{color:#6e6e73}
  .reset,.btn,.chip{background:rgba(0,0,0,0.04);border-color:rgba(0,0,0,0.1);color:#1d1d1f}
  .btn:hover,.reset:hover,.chip:hover{background:rgba(0,0,0,0.08);border-color:rgba(0,0,0,0.15)}
  .chip[aria-checked=true],.chip[aria-pressed=true]{background:linear-gradient(135deg, #007aff 0%, #0056b3 100%);color:#fff;box-shadow:0 2px 8px rgba(0,122,255,0.3)}
  .pill{background:rgba(0,0,0,0.03);border-color:rgba(0,0,0,0.05);color:#3a3a3c}
  output{color:#6e6e73}
  input[type=range]::-webkit-slider-runnable-track{background:rgba(0,0,0,0.12);border-color:rgba(0,0,0,0.05)}
  input[type=range]::-webkit-slider-thumb{background:#ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,1);border-color:rgba(0,0,0,0.1)}
  .check input[type=checkbox]{background:rgba(0,0,0,0.12);border-color:rgba(0,0,0,0.1)}
  .check input[type=checkbox]:checked{background:#34c759}
  .note{color:#6e6e73}
}

@media (prefers-reduced-transparency: reduce) {
  .panel{background:#1c1c1e;backdrop-filter:none;-webkit-backdrop-filter:none}
}

@media (prefers-reduced-motion: reduce) {
  *{transition:none !important;animation:none !important}
}
`;

  function make(doc) {
    return (tag, props = {}, ...kids) => {
      const el = doc.createElement(tag);
      for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        el.setAttribute(key, value === true ? '' : String(value));
      }
      kids.flat().forEach(kid => { if (kid != null) el.append(kid); });
      return el;
    };
  }
  function icon(doc, d, size = 20) {
    const svg = doc.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
    const path = doc.createElementNS(SVGNS, 'path'); path.setAttribute('d', d);
    svg.append(path);
    return svg;
  }
  const sign = v => (v > 0 ? `+${v}` : String(v));

  // Videonun üstündeki yüzen düğme (YouTube dışı siteler): yalnız tık ile mod döndürür.
  function create(hooks) {
    const doc = hooks.doc, h = make(doc);
    const host = doc.createElement('ultrafill-ui');
    host.setAttribute('style', 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block');
    const root = host.attachShadow({ mode: 'open' });
    const st = { video: null, timer: null, moving: false };
    const fab = h('button', { class: 'fab', type: 'button' }, icon(doc, ICONS.fab));
    const wrap = h('div', { class: 'wrap' }, fab);
    root.append(h('style', {}, CSS), wrap);
    // Düğme olayları sayfaya sızmasın (YouTube tıkla-oynat, klavye kısayolları, tekerlek).
    ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'wheel', 'keydown', 'keyup', 'keypress', 'touchstart'].forEach(name => wrap.addEventListener(name, e => e.stopPropagation()));
    function sync() { const t = tip(hooks.getMode()); fab.setAttribute('aria-label', t); fab.setAttribute('title', t); }
    function setShown(on) {
      wrap.setAttribute('class', on ? 'wrap show' : 'wrap');
      clearTimeout(st.timer);
      if (on) st.timer = setTimeout(() => setShown(false), 2500);
    }
    function place() {
      const v = st.video; if (!v) return;
      const r = v.getBoundingClientRect(), iw = doc.defaultView?.innerWidth || 1280, ih = doc.defaultView?.innerHeight || 720;
      const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
      fab.style.left = `${clamp(r.left + r.width - 52, 4, iw - 44)}px`; fab.style.top = `${clamp(r.top + 12, 4, ih - 44)}px`;
    }
    function onMove(e) {
      const v = st.video; if (!v) return;
      const r = v.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height) { place(); setShown(true); }
    }
    fab.addEventListener('click', () => { hooks.cycle(); sync(); });
    fab.addEventListener('focus', () => { place(); setShown(true); });
    sync();
    return {
      host,
      mount(video) {
        st.video = video;
        const fs = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
        const container = fs && fs !== video && fs.nodeType === 1 ? fs : doc.body || doc.documentElement;
        if (host.parentNode !== container) container.append(host); // tam ekranda düğme tam ekran öğesinin içinde olmalı
        if (!st.moving) { doc.addEventListener('mousemove', onMove, { capture: true, passive: true }); st.moving = true; }
        place();
      },
      unmount() {
        clearTimeout(st.timer); setShown(false);
        if (st.moving) { doc.removeEventListener('mousemove', onMove, true); st.moving = false; }
        st.video = null; host.remove();
      },
      refresh() { if (st.video) { place(); sync(); } },
      destroy() { this.unmount(); }
    };
  }

  // Popup'taki tam panel. hooks: doc, getSettings, getScope, getInfo, change, setSite, resetAll.
  function mountInline(hooks, container) {
    const doc = hooks.doc, h = make(doc);
    const host = doc.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const st = { tab: 'zoom', busy: false, key: '', refs: {} };
    const panelEl = h('div', { class: 'panel inline', 'aria-label': 'UltraFill ayarları' });
    root.append(h('style', {}, CSS), panelEl);
    container.append(host);

    const key = () => JSON.stringify([hooks.getSettings(), hooks.getScope()]);
    function change(patch) {
      st.busy = true;
      try { hooks.change(patch); } finally { st.busy = false; }
      st.key = key(); updateStatus();
    }
    const rerender = () => { st.key = key(); render(); };

    // --- bileşenler ---
    function section(title, keys, ...children) {
      const reset = h('button', { class: 'reset', type: 'button', 'aria-label': `${title} bölümünü sıfırla` }, 'Sıfırla');
      reset.addEventListener('click', () => { change(Object.fromEntries(keys.map(k => [k, core.DEFAULTS[k]]))); rerender(); });
      return h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('h3', {}, title), keys.length ? reset : null), ...children);
    }
    function row(d) {
      const id = `r-${d.key}`, s = hooks.getSettings();
      const input = h('input', { type: 'range', id, min: d.min, max: d.max, step: d.step ?? 1, 'aria-label': d.label, disabled: d.disabled });
      input.value = String(d.get(s));
      const out = h('output', { for: id }, d.fmt(d.get(s)));
      input.setAttribute('aria-valuetext', d.fmt(d.get(s)));
      input.addEventListener('input', () => {
        const v = Number(input.value), text = d.fmt(v);
        out.textContent = text; input.setAttribute('aria-valuetext', text);
        change({ [d.key]: d.put(v) });
      });
      return h('div', { class: 'row' }, h('label', { class: 'pill', for: id }, d.label), input, out);
    }
    function check(label, checked, onChange) {
      const input = h('input', { type: 'checkbox' });
      input.checked = checked;
      input.addEventListener('change', () => onChange(input.checked));
      return h('label', { class: 'check' }, input, h('span', {}, label));
    }
    // toggle: profil düğmeleri (aria-pressed; hiçbiri seçili olmayabilir). Aksi halde radyo grubu.
    function choices(label, items, current, pick, toggle = false) {
      const group = h('div', { class: 'chips', role: toggle ? 'group' : 'radiogroup', 'aria-label': label });
      const known = items.some(([value]) => value === current);
      const buttons = items.map(([value, text], index) => {
        const b = toggle
          ? h('button', { class: 'chip', type: 'button', 'aria-pressed': String(value === current) }, text)
          : h('button', { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(value === current), tabindex: value === current || (!known && index === 0) ? '0' : '-1' }, text);
        b.addEventListener('click', () => pick(value));
        return b;
      });
      if (!toggle) group.addEventListener('keydown', e => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const at = items.findIndex(([value]) => value === current);
        pick(items[(at + step + items.length) % items.length][0]);
      });
      buttons.forEach(b => group.append(b));
      return group;
    }
    const info = name => (st.refs[name] = h('p', { class: 'note', role: 'status' }));

    function bodyFor(tab) {
      const s = hooks.getSettings();
      if (tab === 'zoom') {
        return [
          section('Mod', ['mode'], choices('Mod', [['off', 'Kapalı'], ['stretch', 'Doldur'], ['flex', 'Esnek']], s.mode, v => { change({ mode: v }); rerender(); }), info('fallback')),
          section('Yakınlaştırma', ['zoom', 'panX', 'panY'],
            row({ key: 'zoom', label: 'Yakınlaştırma', min: 100, max: 300, get: x => Math.round(x.zoom * 100), put: v => v / 100, fmt: v => `×${(v / 100).toFixed(2)}` }),
            row({ key: 'panX', label: 'Yatay kaydır', min: -100, max: 100, get: x => x.panX, put: v => v, fmt: sign }),
            row({ key: 'panY', label: 'Dikey kaydır', min: -100, max: 100, get: x => x.panY, put: v => v, fmt: sign })),
          section('Esnek germe', ['strength'], row({ key: 'strength', label: 'Esnek germe', min: 0, max: 100, disabled: s.mode !== 'flex', get: x => Math.round(x.strength * 100), put: v => v / 100, fmt: v => `%${v}` })),
          section('En-boy oranına kırp', ['crop'],
            choices('En-boy oranı', [['none', 'Yok'], ...Object.keys(core.CROPS).map(k => [k, k])], s.crop, v => { change({ crop: v }); rerender(); }), info('video')),
        ];
      }
      if (tab === 'image') {
        const pct = (key, label) => row({ key, label, min: -100, max: 100, get: x => x[key], put: v => v, fmt: sign });
        return [section('Görüntü', ['brightness', 'contrast', 'saturation', 'shadows', 'sharpness'],
          pct('brightness', 'Parlaklık'), pct('contrast', 'Kontrast'), pct('saturation', 'Doygunluk'), pct('shadows', 'Gölgeler'),
          row({ key: 'sharpness', label: 'Netlik', min: 0, max: 100, get: x => x.sharpness, put: v => v, fmt: String })),
          section('HDR güçlendirme', ['hdr', 'hdrStrength'],
            check('HDR güçlendirmeyi aç', s.hdr, v => { change({ hdr: v }); rerender(); }),
            row({ key: 'hdrStrength', label: 'Güç', min: 0, max: 100, get: x => x.hdrStrength, put: v => v, fmt: v => `%${v}` }),
            info('hdr'))];
      }
      if (tab === 'fluid') {
        return [section('Akıcılık (deneysel)', ['fluid', 'fluidQuality'],
          check('Akıcılığı aç (kare enterpolasyonu)', s.fluid, v => { change({ fluid: v }); rerender(); }),
          choices('Kalite', [['auto', 'Otomatik'], ['high', 'Yüksek'], ['low', 'Düşük']], s.fluidQuality, v => { change({ fluidQuality: v }); rerender(); }),
          info('fluidFps'), info('fluidCost'), info('fluidStatus'),
          h('p', { class: 'note' }, 'Düşük fps videoyu ekran hızına yaklaştırır; bir kaynak kare gecikme ekler ve GPU yükü artar. DRM/CORS videoda çalışmaz. Spor ve Oyun içeriği için önerilir; profiller bu ayarı değiştirmez.'))];
      }
      if (tab === 'profiles') {
        const active = core.matchProfile(s);
        return [section('Profiller', [],
          choices('Profil', Object.keys(core.PROFILES).map(k => [k, PROFILE_LABEL[k]]), active, v => { change({ ...core.PROFILES[v] }); rerender(); }, true),
          h('p', { class: 'note' }, 'Profil yalnız görüntü kaydırıcılarını ayarlar; mod ve yakınlaştırma değişmez. "Kapalı" bu kaydırıcıları nötr değerlere döndürür.'))];
      }
      const scope = hooks.getScope();
      const resetAll = h('button', { class: 'btn', type: 'button' }, 'Tüm ayarları sıfırla');
      resetAll.addEventListener('click', () => { hooks.resetAll(); rerender(); });
      return [
        section('Bu site', [], check(`Bu sitede ayrı ayarlar kullan (${scope.host || '—'})`, scope.site, v => { hooks.setSite(v); rerender(); }),
          h('p', { class: 'note' }, 'Açıkken değişiklikler yalnız bu siteye uygulanır; kapatınca genel ayarlara dönülür. Alt+Shift+F kısayolu genel modu değiştirir.')),
        section('Genel', [], resetAll)
      ];
    }

    const TABS = [['zoom', 'Yakınlaştırma', ICONS.zoom], ['image', 'Görüntü', ICONS.image], ['fluid', 'Akıcılık', ICONS.fluid], ['profiles', 'Profiller', ICONS.profiles]];
    const fps1 = n => (n ? String(Math.round(n * 10) / 10) : '—');
    function fluidText(s, i) {
      const f = i.fluid ?? {};
      if (!s.fluid) return 'Kapalı';
      if (s.mode === 'off') return 'Mod kapalı: akıcılık çalışmaz';
      if (f.reason) return f.reason.startsWith('DRM') ? f.reason : `Kullanılamıyor: ${f.reason}`;
      if (!f.active) return i.video ? 'Akıcılık başlatılıyor' : 'Video bekleniyor';
      return f.over ? 'Bütçe aşıldı: düşük kaliteye geçildi' : f.note || 'Akıcı';
    }
    function statusOf(id) {
      const s = hooks.getSettings(), i = hooks.getInfo();
      if (id === 'fluid') { const f = i.fluid ?? {}; return !s.fluid || s.mode === 'off' ? 'Kapalı' : f.reason ? 'Yok' : f.over ? 'Bütçe' : 'Açık'; }
      if (id === 'zoom') return s.mode === 'flex' && i.active && i.effective === 'stretch' ? 'Esnek → doğrusal' : MODE_LABEL[s.mode];
      if (id === 'image') return core.imageNeutral(s) ? 'Nötr' : 'Özel';
      const p = core.matchProfile(s);
      return p ? PROFILE_LABEL[p] : 'Özel';
    }
    function updateStatus() {
      const i = hooks.getInfo(), s = hooks.getSettings(), r = st.refs;
      for (const [id] of TABS) if (r[`ts-${id}`]) r[`ts-${id}`].textContent = statusOf(id);
      if (r.fallback) r.fallback.textContent = s.mode === 'off' ? '' : i.reason ? `Doğrusal geri düşüş: ${i.reason}` : i.active ? '' : 'Video bekleniyor.';
      if (r.video) r.video.textContent = i.video ? `Video: ${i.video.resolution} · ${i.video.ratio}` : 'Video: —';
      const f = i.fluid ?? {}, live = s.fluid && s.mode !== 'off' && f.active;
      if (r.fluidFps) r.fluidFps.textContent = live ? `${fps1(f.srcFps)} → ${fps1(f.outFps)} FPS (ekran ~${f.hz} Hz, gecikme ~${f.latencyMs} ms)` : '';
      if (r.fluidCost) r.fluidCost.textContent = live ? `İşleme ${f.ms} ms / bütçe ${f.budgetMs} ms · ${f.quality === 'high' ? 'yüksek (hareket telafili)' : 'düşük (düz karışım)'}${f.gpu ? ' · GPU ölçümü' : ' · CPU ölçümü'}` : '';
      if (r.fluidStatus) r.fluidStatus.textContent = fluidText(s, i);
      if (r.hdr) r.hdr.textContent = doc.defaultView?.matchMedia?.('(dynamic-range: high)')?.matches ? 'HDR ekran algılandı (gerçek HDR çıkışı sağlanmaz; yalnız ton eğrisi)' : 'SDR ekran: ton genişletme';
    }
    function render() {
      st.refs = {};
      const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'UltraFill bölümleri' });
      TABS.forEach(([id, name, d]) => {
        const ts = st.refs[`ts-${id}`] = h('span', { class: 'ts' });
        const b = h('button', { class: 'tab', type: 'button', role: 'tab', id: `t-${id}`, 'aria-selected': String(st.tab === id), tabindex: st.tab === id ? '0' : '-1' }, icon(doc, d), h('span', { class: 'tn' }, name), ts);
        b.addEventListener('click', () => { st.tab = id; render(); st.refs[`b-${id}`]?.focus?.(); });
        st.refs[`b-${id}`] = b; tabsEl.append(b);
      });
      tabsEl.addEventListener('keydown', e => {
        const at = TABS.findIndex(([id]) => id === st.tab), step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step || st.tab === 'settings') return;
        e.preventDefault(); st.tab = TABS[(at + step + TABS.length) % TABS.length][0]; render(); st.refs[`b-${st.tab}`]?.focus?.();
      });
      const gear = h('button', { class: 'gear', type: 'button', 'aria-label': 'Ayarlar', title: 'Ayarlar', 'aria-pressed': String(st.tab === 'settings') }, icon(doc, ICONS.gear));
      gear.addEventListener('click', () => { st.tab = st.tab === 'settings' ? 'zoom' : 'settings'; render(); });
      tabsEl.append(gear);
      const body = h('div', { class: 'body', role: 'tabpanel', 'aria-labelledby': st.tab === 'settings' ? null : `t-${st.tab}` }, ...bodyFor(st.tab));
      panelEl.replaceChildren(tabsEl, body);
      updateStatus();
    }

    rerender();
    return {
      refresh() { if (!st.busy && key() !== st.key) rerender(); else updateStatus(); },
      destroy() { host.remove(); }
    };
  }

  // YouTube kontrol çubuğu düğmesi: yalnız tık ile mod döndürür. Sağ tık/uzun basma sitenin varsayılanında kalır.
  // 'ytp-button' sınıfı bilerek yok: YouTube'un kendi ipucu mekanizması bu sınıfa bağlanıp sayfanın köşesinde ayrı bir ipucu çizebilir; yalnız yerel title kullanılır.
  function youtube(hooks) {
    const doc = hooks.doc, h = make(doc);
    let btn = null, observer = null, watched = null, throttle = null;
    function sync() {
      if (!btn) return;
      const mode = hooks.getMode(), t = tip(mode);
      btn.setAttribute('aria-label', t); btn.setAttribute('title', t); btn.setAttribute('data-mode', mode);
      btn.style.opacity = mode === 'off' ? '0.55' : '1';
    }
    function build() {
      const b = h('button', { class: 'ultrafill-yt', type: 'button', 'data-ultrafill': 'yt' });
      b.setAttribute('style', 'display:inline-flex;align-items:center;justify-content:center;width:48px;height:100%;padding:0;border:0;background:none;color:#fff;cursor:pointer;vertical-align:top;overflow:hidden');
      const svg = icon(doc, ICONS.fab, 24);
      svg.setAttribute('style', 'display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round');
      b.append(svg);
      b.addEventListener('click', e => { e.stopPropagation(); hooks.cycle(); sync(); });
      b.addEventListener('keydown', e => e.stopPropagation()); // YouTube klavye kısayolları düğmeyi ele geçirmesin
      return b;
    }
    function watch(bar) {
      if (watched === bar || typeof MutationObserver === 'undefined') return;
      observer?.disconnect(); watched = bar;
      observer = new MutationObserver(() => { clearTimeout(throttle); throttle = setTimeout(ensure, 120); });
      observer.observe(bar.closest?.('.html5-video-player') ?? bar.parentNode ?? bar, { childList: true, subtree: true });
    }
    function ensure() {
      const bar = doc.querySelector('.ytp-right-controls');
      if (!bar) return;
      const dup = bar.querySelector('.ultrafill-yt');
      if (dup && dup !== btn) dup.remove(); // önceki betik örneğinden kalan
      btn ??= build();
      if (btn.parentNode !== bar) bar.insertBefore(btn, bar.firstChild);
      sync(); watch(bar);
    }
    return {
      ensure,
      destroy() { observer?.disconnect(); observer = watched = null; clearTimeout(throttle); btn?.remove(); btn = null; },
      get button() { return btn; }
    };
  }

  globalThis.UltraFillPanel = Object.freeze({ create, mountInline, youtube });
})();
