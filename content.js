(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const core = globalThis.UltraFillCore, fxlib = globalThis.UltraFillFx, ui = globalThis.UltraFillPanel, fluidlib = globalThis.UltraFillFluid; // isteğe bağlı: yoksa yalnız temel germe çalışır
  const HOST = globalThis.location?.hostname ?? '';
  const allowed = ['off', 'stretch', 'flex'];
  const norm = data => core ? core.normalize(data) : { mode: allowed.includes(data?.mode) ? data.mode : 'stretch', strength: Number.isFinite(data?.strength) ? Math.max(0, Math.min(1, data.strength)) : 1 };
  const siteOf = data => (data?.sites && typeof data.sites === 'object' && data.sites[HOST] && typeof data.sites[HOST] === 'object' ? data.sites[HOST] : null);
  const effective = data => norm({ ...data, ...siteOf(data) });
  let raw = {}, settings = norm({}), current = null, queued = false, panel = null, yt = null, saveTimer = null;
  const dirty = new Set();
  const fluidDead = new WeakMap(); // video -> akıcılığın kapandığı neden (yeni kaynakta silinir)
  // Sitenin öğelerinin satır içi stiline HİÇ yazmayız (YouTube width/height/left/top değerlerini önbellekler; sökümde kaybolurdu).
  // Bunun yerine öznitelik + enjekte stil sayfası (!important, sitenin önemsiz satır içi değerini yener). Söküm = özniteliği kaldırmak.
  // Satır içi yalnız bizim --uf-* özel değişkenlerimiz yazılır (site dokunmaz).
  const CSS = [
    '[data-uf-rel]{position:relative!important}',
    'video[data-uf="fill"],[data-uf-branch]{position:absolute!important;top:0!important;right:0!important;bottom:0!important;left:0!important;margin:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;aspect-ratio:auto!important}',
    'video[data-uf-fit]{object-fit:fill!important}',
    'video[data-uf-hide]{opacity:0!important}',
    'video[data-uf-filter]{filter:var(--uf-filter)!important}',
    'video[data-uf-xf]{transform:var(--uf-transform)!important;transform-origin:50% 50%!important}',
    '[data-uf-clip]{overflow:hidden!important}'
  ].join('');
  const ATTRS = ['data-uf', 'data-uf-branch', 'data-uf-rel', 'data-uf-fit', 'data-uf-hide', 'data-uf-filter', 'data-uf-xf', 'data-uf-clip'], VARS = ['--uf-filter', '--uf-transform'];
  const injected = new WeakSet(); let sheet = null;
  function inject(element) { // belge/shadow root başına bir kez
    const root = element.getRootNode?.(); if (!root || injected.has(root)) return;
    injected.add(root);
    try { // yapılandırılmış stil sayfası sayfa CSP'sinden etkilenmez
      if (typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in root) {
        if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); }
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]; return;
      }
    } catch {}
    const style = (root.ownerDocument ?? root).createElement('style'); style.textContent = CSS;
    (root.head ?? root.documentElement ?? root).append(style);
  }
  const flag = (element, name, value = '') => {
    if (value === false) { if (element.hasAttribute(name)) element.removeAttribute(name); return; }
    inject(element); if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  };
  const cssVar = (element, name, value) => { if (value) element.style.setProperty(name, value); else if (element.style.getPropertyValue(name)) element.style.removeProperty(name); };
  const clear = element => { ATTRS.forEach(name => flag(element, name, false)); VARS.forEach(name => cssVar(element, name, '')); };
  // Known player containers (convenience only): without a match, the generic rule applies and geometry stays untouched.
  const PLAYERS = '#movie_player, .html5-video-player, [data-uia="video-canvas"], .watch-video--player-view, .webPlayerSDKContainer, .rendererContainer, .video-js, .jwplayer, .plyr';
  const fsOf = doc => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  const composedParent = el => el.parentElement ?? el.getRootNode?.().host ?? null;
  const isRoot = el => el === el.ownerDocument?.documentElement || el === el.ownerDocument?.body;
  const covers = (a, b) => ['left', 'top', 'width', 'height'].every(k => Math.abs(a[k] - b[k]) <= 1);
  function composedContains(ancestor, el) {
    for (; el; el = composedParent(el)) if (el === ancestor) return true;
    return false;
  }
  // Elements from start up to (excluding) the stop match; null when stop is never reached.
  function branch(start, stop) {
    const list = [];
    for (let el = start; el; el = composedParent(el)) { if (stop(el)) return list; list.push(el); }
    return null;
  }
  // Returns the fullscreen element holding the video, or the video's own document root when an outer document is fullscreen.
  function fullscreenArea(video) {
    const own = video.ownerDocument || document;
    let doc = own, el = video;
    while (doc) {
      const fs = fsOf(doc);
      if (fs && composedContains(fs, el)) return doc === own ? fs : own.documentElement;
      const frame = doc.defaultView?.frameElement;
      if (!frame) break;
      el = frame; doc = frame.ownerDocument;
    }
    return null;
  }
  const fill = element => (element.localName === 'video' ? flag(element, 'data-uf', 'fill') : flag(element, 'data-uf-branch'));
  function report() {
    try { api.runtime.sendMessage({ type: 'status', active: !!current, mode: current?.effective ?? settings.mode, reason: current?.reason ?? '', host: HOST, site: !!siteOf(raw), info: info() })?.catch(() => {}); } catch {}
    try { syncUi(); } catch (error) { console.warn('UltraFill arayüzü', error); }
  }
  function stop(s) {
    s.fluid?.stop();
    if (s.frame != null) {
      if (s.video.cancelVideoFrameCallback && s.video.requestVideoFrameCallback) s.video.cancelVideoFrameCallback(s.frame);
      else cancelAnimationFrame(s.frame);
      s.frame = null;
    }
  }
  // Filtre + dönüşüm (zoom/kırpma): nötrse hiçbir satır içi stil bırakılmaz.
  function applyFx(s) {
    if (!s.fx) return;
    const { filter, transform } = s.fx.css();
    cssVar(s.video, '--uf-filter', filter); flag(s.video, 'data-uf-filter', filter ? '' : false);
    cssVar(s.video, '--uf-transform', transform); flag(s.video, 'data-uf-xf', transform ? '' : false); flag(s.parent, 'data-uf-clip', transform ? '' : false);
    if (s.canvas) { s.canvas.style.filter = filter; s.canvas.style.transform = transform; s.canvas.style.transformOrigin = '50% 50%'; }
  }
  function cleanup() {
    if (!current) return;
    const s = current; current = null;
    stop(s); s.resize.disconnect(); s.attributes.disconnect();
    s.events.forEach(([name, fn]) => s.video.removeEventListener(name, fn));
    s.fx?.destroy();
    s.fluid?.destroy(); s.fluid = null;
    s.canvas?.remove();
    if (s.gl) {
      s.gl.deleteTexture(s.texture); s.gl.deleteBuffer(s.buffer); s.gl.deleteProgram(s.program);
    }
    s.touched.forEach(clear);
  }
  function fallback(s, reason) {
    if (s.fluid) { fluidDead.set(s.video, reason || 'Akıcılık kapandı'); s.fluidReason = reason || 'Akıcılık kapandı'; s.fluid.destroy(); s.fluid = null; }
    stop(s); s.canvas?.remove(); s.canvas = null;
    clear(s.video);
    if (s.expand) fill(s.video);
    s.effective = 'stretch'; s.reason = reason;
    // object-fit:fill is linear texture scaling without scaling native controls.
    flag(s.video, 'data-uf-fit');
    applyFx(s);
    report();
  }
  function setupGL(s) {
    const canvas = document.createElement('canvas');
    s.canvas = canvas;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.visibility = 'hidden';
    Object.assign(canvas.style, { position: 'absolute', pointerEvents: 'none', margin: '0', padding: '0', zIndex: getComputedStyle(s.video).zIndex === 'auto' ? '0' : getComputedStyle(s.video).zIndex });
    s.video.after(canvas);
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback(s, 'WebGL bağlamı kayboldu'); });
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL kullanılamıyor');
    s.gl = gl;
    const shader = (type, source) => {
      const value = gl.createShader(type); gl.shaderSource(value, source); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) { gl.deleteShader(value); throw new Error('Shader derlenemedi'); }
      return value;
    };
    const vertex = shader(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0.0,1.0);}');
    let fragment;
    try { fragment = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 uv; uniform sampler2D image; uniform float k; void main(){float x=uv.x*2.0-1.0;float lo=-1.0;float hi=1.0;for(int i=0;i<14;i++){float mid=(lo+hi)*0.5;float mapped=mid*(k+(1.0-k)*mid*mid);if(mapped<x)lo=mid;else hi=mid;}float u=(lo+hi)*0.5;gl_FragColor=texture2D(image,vec2((u+1.0)*0.5,uv.y));}'); }
    catch (error) { gl.deleteShader(vertex); throw error; }
    const program = s.program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader bağlanamadı');
    gl.useProgram(program);
    s.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, s.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    s.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, s.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    s.uniform = gl.getUniformLocation(program, 'k');
  }
  // --- Akıcılık (fluid.js): kendi canvas'ı + motoru; video ancak ilk kare çizilince gizlenir ---
  function setupFluid(s) {
    const canvas = document.createElement('canvas');
    s.canvas = canvas;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.visibility = 'hidden';
    const z = getComputedStyle(s.video).zIndex;
    Object.assign(canvas.style, { position: 'absolute', pointerEvents: 'none', margin: '0', padding: '0', zIndex: z === 'auto' ? '0' : z });
    s.video.after(canvas);
    s.fluid = fluidlib.create(s.video, canvas, {
      quality: settings.fluidQuality,
      onReady: () => { if (s === current && s.fluid) flag(s.video, 'data-uf-hide'); },
      onFrame: () => { if (s === current) fluidPlace(s); },
      onFail: reason => { if (s !== current) return; fluidDead.set(s.video, reason); cleanup(); schedule(); }
    });
  }
  function fluidPlace(s) {
    const { video, parent, canvas, fluid } = s;
    if (!fluid || !canvas) return;
    const target = s.area ?? video, rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const width = target.clientWidth || rect.width, height = target.clientHeight || rect.height;
    const [w, h] = fluidlib.capSize(width, height, devicePixelRatio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const pr = parent.getBoundingClientRect();
    Object.assign(canvas.style, { left: `${rect.left - pr.left + parent.scrollLeft}px`, top: `${rect.top - pr.top + parent.scrollTop}px`, width: `${width}px`, height: `${height}px` });
    fluid.setK(s.effective === 'flex' ? UltraFillMapping.coefficient(video.videoWidth / video.videoHeight, width / height, settings.strength) : 1);
    fluid.redraw(); // durmuşken boyut/eğri değişimini yansıt (çalışırken no-op)
  }
  function draw(s) {
    if (s.fluid || s !== current || s.effective !== 'flex' || document.hidden || s.video.readyState < 2) return;
    if (s.video.mediaKeys) { fallback(s, 'DRM/EME: yalnız doğrusal germe'); return; }
    const { video, parent, canvas, gl } = s;
    const target = s.area ?? video;
    const targetRect = target.getBoundingClientRect();
    if (!targetRect.width || !targetRect.height) return;
    const width = target.clientWidth || targetRect.width, height = target.clientHeight || targetRect.height;
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const parentRect = parent.getBoundingClientRect();
    const left = targetRect.left - parentRect.left + parent.scrollLeft;
    const top = targetRect.top - parentRect.top + parent.scrollTop;
    Object.assign(canvas.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Video dokusu okunamadı');
      gl.viewport(0, 0, w, h);
      gl.uniform1f(s.uniform, UltraFillMapping.coefficient(video.videoWidth / video.videoHeight, width / height, settings.strength));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Video çizilemedi');
      canvas.style.visibility = 'visible';
      flag(video, 'data-uf-hide');
    } catch (error) { fallback(s, error.name === 'SecurityError' ? 'CORS/DRM: video piksel erişimi engelli' : error.message); }
  }
  function start(s) {
    stop(s);
    if (s.fluid) { s.fluid.start(); return; }
    draw(s);
    const tick = () => {
      s.frame = null;
      if (s !== current || s.effective !== 'flex' || s.video.paused || s.video.ended || document.hidden) return;
      draw(s);
      if (s.effective === 'flex') s.frame = s.video.requestVideoFrameCallback ? s.video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    if (!s.video.paused && !document.hidden && s.effective === 'flex') s.frame = s.video.requestVideoFrameCallback ? s.video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  }
  // Geometri kararını yerinde (yeniden) değerlendir. Sök-tak yok: sahipli stiller idempotent yeniden yazılır,
  // sayfanın araya yazdığı değerler yeni "özgün" olur. Doğal geometri yalnız henüz genişletmediysek ölçülebilir.
  function layout(s) {
    if (s.own || !(s.viewport || s.area)) return;
    if (!s.expand) {
      const target = s.viewport ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : s.area.getBoundingClientRect();
      // Video box already covers the target: leave geometry alone.
      if (covers(s.video.getBoundingClientRect(), target)) return;
      const chain = branch(s.parent, s.viewport ? isRoot : el => el === s.area);
      if (!chain) return;
      s.chain = chain; s.expand = true;
      chain.forEach(element => s.touched.add(element));
      if (s.area) s.touched.add(s.area);
    }
    // Expand only the video branch up to the target.
    s.chain.forEach(fill);
    if (s.area && getComputedStyle(s.area).position === 'static') flag(s.area, 'data-uf-rel');
    fill(s.video);
  }
  function settle(s) { layout(s); applyFx(s); if (s.fluid) { fluidPlace(s); s.fluid.setQuality(settings.fluidQuality); } start(s); }
  function attach(video) {
    const parent = composedParent(video);
    const area = fullscreenArea(video);
    const viewport = !!area && isRoot(area);
    const box = viewport ? null : area ?? parent.closest?.(PLAYERS) ?? null;
    const own = box === video; // video element itself is fullscreen: only object-fit applies
    const s = current = { video, parent, area: box, viewport, own, expand: false, chain: null, touched: new Set([video, parent]), effective: settings.mode, reason: '', frame: null, events: [] };
    s.fx = fxlib?.create(video, {
      box: () => s.area ?? s.parent,
      parent: () => s.parent,
      anchor: () => {
        if (getComputedStyle(s.parent).position === 'static') flag(s.parent, 'data-uf-rel');
        if (!s.expand && getComputedStyle(video).position === 'static') flag(video, 'data-uf-rel');
      },
      changed: () => { if (s === current) { applyFx(s); report(); } }
    });
    s.fx?.sync(settings);
    layout(s);
    if (!s.expand && !own && (settings.mode === 'flex' || settings.fluid) && getComputedStyle(parent).position === 'static') {
      flag(parent, 'data-uf-rel'); // anchor for the WebGL canvas only
    }
    s.attributes = new MutationObserver(records => {
      if (video.hasAttribute('controls')) {
        fallback(s, 'Yerel kontroller algılandı');
      } else {
        cleanup(); schedule();
      }
    });
    s.attributes.observe(video, { attributes: true, attributeFilter: ['controls'] });
    s.resize = new ResizeObserver(() => settle(s));
    s.resize.observe(box ?? (viewport ? video.ownerDocument.documentElement : parent));
    s.resize.observe(video);
    const listen = (name, fn) => { video.addEventListener(name, fn); s.events.push([name, fn]); };
    listen('pause', () => { stop(s); s.fluid?.still(); draw(s); });
    listen('ended', () => { stop(s); });
    listen('play', () => { start(s); });
    listen('seeked', () => { start(s); });
    listen('loadeddata', () => { start(s); });
    listen('loadedmetadata', () => settle(s));
    listen('encrypted', () => fallback(s, 'DRM/EME: yalnız doğrusal germe'));
    // Yeni kaynak (sonraki video, reklam→video): yerinde güncelle. Esnek mod geri düşmüşse yeniden dene.
    listen('emptied', () => {
      const retry = !!fluidDead.get(video); fluidDead.delete(video);
      s.fluid?.reset();
      if (retry || s.effective !== settings.mode) { cleanup(); schedule(); return; } settle(s);
    });
    // Akıcılık: koşullar uygunsa canvas yolu (stretch ve flex); aksi halde neden yazılır ve normal yol sürer.
    if (settings.fluid && settings.mode !== 'off') {
      s.fluidReason = !fluidlib ? 'Akıcılık modülü yüklenmedi' : fluidDead.get(video) ?? (own ? 'Video tam ekranı: akıcılık kullanılamaz' : video.mediaKeys ? 'DRM: kullanılamaz (şifreli video)' : '');
      if (!s.fluidReason) {
        try { setupFluid(s); } catch (error) {
          s.fluid = null; s.canvas?.remove(); s.canvas = null; s.fluidReason = error.name === 'SecurityError' ? 'CORS/DRM: video piksel erişimi engelli' : error.message;
        }
      }
    }
    if (s.fluid) { flag(video, 'data-uf-fit'); start(s); }
    else if (settings.mode === 'stretch') fallback(s, s.fluidReason || '');
    else if (fluidDead.has(video)) fallback(s, fluidDead.get(video));
    else if (own) fallback(s, 'Video tam ekranı: yalnız doğrusal germe');
    else if (video.mediaKeys) fallback(s, 'DRM/EME: yalnız doğrusal germe');
    else {
      try { setupGL(s); start(s); } catch (error) { fallback(s, error.message); }
    }
    applyFx(s);
    report();
  }
  function getVideos(root = document) {
    const videos = [...root.querySelectorAll('video')];
    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        videos.push(...getVideos(el.shadowRoot));
      }
    });
    return videos;
  }
  function scan() {
    queued = false;
    if (settings.mode === 'off') { cleanup(); report(); return; }
    const candidates = getVideos(document).filter(video => {
      const rect = video.getBoundingClientRect();
      const fullscreen = fsOf(document);
      if (fullscreen && !composedContains(fullscreen, video)) return false;
      return video.isConnected && composedParent(video) && rect.width > 80 && rect.height > 40 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && getComputedStyle(video).display !== 'none' && getComputedStyle(video).visibility !== 'hidden';
    });
    const area = video => { const r = video.getBoundingClientRect(); return r.width * r.height; };
    candidates.sort((a, b) => Number(!b.paused && !b.ended) - Number(!a.paused && !a.ended) || area(b) - area(a));
    const video = candidates[0];
    if (video === current?.video) {
      if (current) settle(current);
      report();
      return;
    }
    cleanup(); if (video) attach(video); else report();
  }
  function schedule() { if (!queued) { queued = true; queueMicrotask(scan); } }

  // --- ayarlar: storage.local + site bazlı geçersiz kılma (sites[hostname]) ---
  function recompute() {
    const prev = settings; settings = effective(raw);
    if (!current || settings.mode !== prev.mode || settings.fluid !== prev.fluid) { cleanup(); schedule(); return; }
    current.fx?.sync(settings); settle(current); report();
  }
  function update(data) {
    if (dirty.size) return; // bekleyen yerel değişiklik var: eski yankı üzerine yazmasın
    raw = data && typeof data === 'object' ? data : {};
    recompute();
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!dirty.size) return;
    const out = {}; dirty.forEach(key => { out[key] = raw[key]; }); dirty.clear();
    try { api.storage.local.set(out)?.catch(() => {}); } catch {}
  }
  function commit(patch) {
    const sites = raw.sites && typeof raw.sites === 'object' ? raw.sites : {};
    if (sites[HOST]) { raw = { ...raw, sites: { ...sites, [HOST]: { ...sites[HOST], ...patch } } }; dirty.add('sites'); }
    else { raw = { ...raw, ...patch }; Object.keys(patch).forEach(key => dirty.add(key)); }
    recompute();
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 150);
  }
  // Popup paneli için durum özeti (background üzerinden iletilir).
  function info() {
    const v = current?.video;
    return { active: !!current, effective: current?.effective ?? settings.mode, reason: current?.reason ?? '', video: v && core ? core.describeAspect(v.videoWidth, v.videoHeight) : null, fluid: { enabled: settings.fluid && settings.mode !== 'off', reason: settings.fluid ? current?.fluidReason ?? '' : '', ...(current?.fluid ? { active: true, ...current.fluid.stats() } : { active: false }) } };
  }

  // --- sayfa içi arayüz (panel.js): yüzen düğme ve YouTube düğmesi yalnız mod döndürür ---
  const uiHooks = {
    getMode: () => settings.mode,
    cycle: () => commit({ mode: core.nextMode(settings.mode) })
  };
  function syncUi() {
    if (!ui || !core) return;
    if (settings.mode === 'off') { panel?.destroy(); panel = null; }
    else if (current) {
      panel ??= ui.create({ ...uiHooks, doc: document });
      panel.mount(current.video);
      panel.refresh();
    } else panel?.unmount();
    yt ??= ui.youtube({ ...uiHooks, doc: document });
    yt.ensure(); // kapalıyken de kalır: kapalı → doldur geçişi bu düğmeyle yapılır
  }
  const load = () => api.storage.local.get(null).then(update).catch(() => {});
  load();
  api.storage.onChanged.addListener((changes, area) => { if (area === 'local') load(); });
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches?.('video') || n.querySelector?.('video') || n.shadowRoot)))) schedule(); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('play', schedule, true);
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(name => document.addEventListener(name, () => { cleanup(); schedule(); }));
  document.addEventListener('visibilitychange', () => { if (current) { if (document.hidden) { stop(current); } else { start(current); } } });
  document.addEventListener('yt-navigate-finish', schedule);
  addEventListener('resize', schedule);
  // No scroll listener: a full DOM scan per scroll is costly; the 2 s interval below catches visibility changes.
  setInterval(() => { if (!document.hidden) { schedule(); report(); } }, 2000);
  addEventListener('pagehide', () => { flush(); cleanup(); panel?.destroy(); yt?.destroy(); panel = yt = null; });
})();
