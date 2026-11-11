/* UltraFill Akıcılık: gerçek zamanlı kare enterpolasyonu (deneysel). Saf hesaplar + WebGL motoru.
   Yöntem: her yeni video karesi iki dokulu halkaya yüklenir; her ekran karesinde önceki ile şimdiki kare arasında
   t konumu çizilir (bir kaynak kare gecikme). Yüksek kalite: WebGL2'de 1/4 çözünürlükte 8x8 blok eşleme (±6 px, SAD)
   hareket alanı + hareket telafili karışım; güvensiz bloklarda düz karışım. Düşük kalite: düz karışım. Üçüncü taraf kod yok. */
(() => {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const MAX_W = 2560, MAX_H = 1440, MAX_DPR = 2;
  const HZ = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240];
  const median = list => { const a = [...list].sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };

  // --- saf fonksiyonlar ---
  // t: önceki (0) ile şimdiki (1) kare arasındaki konum; arrival = şimdiki karenin geldiği an, interval = kare süresi (ms).
  const interpT = (now, arrival, interval) => (interval > 0 ? clamp((now - arrival) / interval, 0, 1) : 1);
  const bypassInterpolation = (fps, hz) => fps > 0 && hz > 0 && fps >= hz * 0.9;
  const frameT = (t, fps, hz) => bypassInterpolation(fps, hz) ? 1 : t;
  // Düşük kalite (hareket telafisi yok): kesirli t'de iki kareyi düz karıştırmak çift görüntü/bulanıklık yapar;
  // en yakın kareye yuvarlamak (judder'a geri döner ama) çift görüntüyü tamamen giderir. Yalnız 'low' kalitede uygulanır.
  const snapT = (t, quality) => quality === 'low' ? Math.round(t) : t;
  function analysisSize(w, h) {
    const aw = clamp(Math.round(w / 32) * 8, 16, 480);
    return [aw, Math.max(16, Math.round(aw * h / w / 8) * 8)];
  }
  // mediaTime farklarından (sn) kaynak fps: ortanca; geçerli örnek yoksa 0.
  const estimateFps = deltas => { const m = median(deltas.filter(d => d > 0 && Number.isFinite(d))); return m ? +(1 / m).toFixed(2) : 0; };
  // rAF aralıklarından (ms) yenileme hızı: en iyi %20'lik dilim (yük altında yavaşlayan kareleri yok sayar), bilinen hıza yuvarla.
  function estimateHz(deltasMs) {
    const a = deltasMs.filter(d => d > 1 && d < 100).sort((x, y) => x - y);
    if (a.length < 10) return 60;
    const hz = 1000 / a[Math.floor((a.length - 1) * 0.2)];
    return HZ.find(h => Math.abs(h - hz) / h < 0.04) ?? Math.round(hz);
  }
  const budgetMs = hz => (hz > 0 ? 1000 / hz : 1000 / 60);
  // Bir kaynak kare gecikme (ms).
  const latencyMs = fps => (fps > 0 ? 1000 / fps : 0);
  // pref: 'auto'|'high'|'low'. Bütçe aşılırsa yüksek -> düşük (over=true).
  function decideQuality({ pref, canHigh, ms, budget }) {
    if (pref === 'low' || !canHigh) return { quality: 'low', over: false };
    return ms > budget ? { quality: 'low', over: true } : { quality: 'high', over: false };
  }
  // Canvas piksel boyutu: DPR <= 2, en çok 2560x1440 (oran korunur).
  function capSize(cssW, cssH, dpr = 1) {
    const d = clamp(dpr || 1, 1, MAX_DPR), w = Math.max(1, Math.round(cssW * d)), h = Math.max(1, Math.round(cssH * d));
    const s = Math.min(1, MAX_W / w, MAX_H / h);
    return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
  }

  // --- GLSL ES 1.00 (WebGL1 ve WebGL2'de çalışır) ---
  const PR = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0.0,1.0);}';
  const COPY_FS = `${PR}varying vec2 uv;uniform sampler2D img;void main(){gl_FragColor=texture2D(img,uv);}`;
  // Her hareket ızgarası pikseli bir 8x8 blok (analiz pikseli); 4x4 örnek, ±6 aday; sıfır harekete küçük ayrıcalık.
  const ME_FS = `${PR}varying vec2 uv;uniform sampler2D cur;uniform sampler2D prev;uniform vec2 asz;uniform vec2 grid;
float lum(sampler2D s,vec2 q){return dot(texture2D(s,(q+0.5)/asz).rgb,vec3(0.299,0.587,0.114));}
void main(){vec2 b=floor(uv*grid)*8.0;float best=1e9;vec2 bd=vec2(0.0);
float mean=0.0;float sq=0.0;
for(int y=0;y<4;y++){for(int x=0;x<4;x++){float v=lum(cur,b+vec2(float(x),float(y))*2.0+1.0);mean+=v;sq+=v*v;}}
if(sq/16.0-(mean/16.0)*(mean/16.0)<0.0004){gl_FragColor=vec4(0.5,0.5,1.0,1.0);return;}
for(int j=-6;j<=6;j++){for(int i=-6;i<=6;i++){vec2 d=vec2(float(i),float(j));float s=0.0;
for(int y=0;y<4;y++){for(int x=0;x<4;x++){vec2 q=b+vec2(float(x),float(y))*2.0+1.0;s+=abs(lum(cur,q)-lum(prev,q+d));}}
s=s/16.0+0.0015*length(d);if(s<best){best=s;bd=d;}}}
gl_FragColor=vec4(bd/16.0+0.5,clamp(best/0.25,0.0,1.0),1.0);}`;
  // Ekran->kaynak eşleme k (stretch'te k=1: düz doldurma; flex'te mevcut eğri), sonra hareket telafili karışım.
  const FIN_FS = `${PR}varying vec2 uv;uniform sampler2D pv;uniform sampler2D cu;uniform sampler2D mv;uniform float t;uniform float k;uniform float hq;uniform vec2 asz;
void main(){float x=uv.x*2.0-1.0;float lo=-1.0;float hi=1.0;
for(int i=0;i<14;i++){float mid=(lo+hi)*0.5;float mapped=mid*(k+(1.0-k)*mid*mid);if(mapped<x)lo=mid;else hi=mid;}
vec2 p=vec2(((lo+hi)*0.5+1.0)*0.5,uv.y);vec2 d=vec2(0.0);
vec4 plain=mix(texture2D(pv,p),texture2D(cu,p),t);
if(t>=1.0){gl_FragColor=texture2D(cu,p);return;}
float edge=0.0;
if(hq>0.5){vec2 stepUV=8.0/asz;vec4 m=texture2D(mv,p);
vec4 l=texture2D(mv,p-vec2(stepUV.x,0.0));vec4 r=texture2D(mv,p+vec2(stepUV.x,0.0));
vec4 u=texture2D(mv,p-vec2(0.0,stepUV.y));vec4 v=texture2D(mv,p+vec2(0.0,stepUV.y));
edge=smoothstep(1.0,3.0,16.0*max(max(length(m.rg-l.rg),length(m.rg-r.rg)),max(length(m.rg-u.rg),length(m.rg-v.rg))));
m=(m+l+r+u+v)/5.0;d=(m.rg-0.5)*16.0/asz*(1.0-smoothstep(0.08,0.2,m.b));}
vec4 a=texture2D(pv,p+d*t);vec4 b=texture2D(cu,p-d*(1.0-t));
float reject=max(edge,smoothstep(0.08,0.25,length(a.rgb-b.rgb)));
gl_FragColor=mix(mix(a,b,t),plain,reject);}`;

  const now = () => globalThis.performance?.now?.() ?? Date.now();

  // opts: { quality:'auto'|'high'|'low', onFail(reason), onReady(), onFrame() }. Başarısızlıkta Error fırlatır.
  function create(video, canvas, opts = {}) {
    const attrs = { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    let gl = canvas.getContext('webgl2', attrs); const v2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', attrs);
    if (!gl) throw new Error('WebGL kullanılamıyor');
    let dead = false, running = false, raf = null, rvfc = null, ready = false, checks = 0;
    const st = { pref: opts.quality ?? 'auto', quality: 'low', over: false, canHigh: false, note: '', k: 1, frames: 0, outFrames: 0, still: false };
    const hasRvfc = !!(video.requestVideoFrameCallback && video.cancelVideoFrameCallback);
    const fail = error => {
      if (dead) return;
      const reason = error?.name === 'SecurityError' ? 'CORS/DRM: video piksel erişimi engelli' : error?.message || String(error);
      stopLoop(); opts.onFail?.(reason);
    };
    const onLost = event => { event.preventDefault?.(); fail(new Error('WebGL bağlamı kayboldu')); };
    canvas.addEventListener?.('webglcontextlost', onLost);

    const shader = (type, source) => {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); throw new Error('Shader derlenemedi'); }
      return s;
    };
    const program = fs => {
      const vs = shader(gl.VERTEX_SHADER, VS); let f;
      try { f = shader(gl.FRAGMENT_SHADER, fs); } catch (e) { gl.deleteShader(vs); throw e; }
      const pg = gl.createProgram(); gl.attachShader(pg, vs); gl.attachShader(pg, f); gl.bindAttribLocation(pg, 0, 'p'); gl.linkProgram(pg);
      gl.deleteShader(vs); gl.deleteShader(f);
      if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) { gl.deleteProgram(pg); throw new Error('Shader bağlanamadı'); }
      const u = {}; for (const n of ['pv', 'cu', 'mv', 't', 'k', 'hq', 'asz', 'img', 'cur', 'prev', 'grid']) u[n] = gl.getUniformLocation(pg, n);
      return { pg, u };
    };
    const texture = (w, h) => {
      const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
      for (const [pname, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, pname, val);
      if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return tx;
    };
    const target = (w, h) => {
      const tx = texture(w, h), fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tx, fbo, w, h, ok };
    };
    const freeTarget = t => { if (t) { gl.deleteTexture(t.tx); gl.deleteFramebuffer(t.fbo); } };

    const fin = program(FIN_FS); // başarısızsa create() fırlatır -> çağıran geri düşer
    let copy = null, me = null;
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (v2) { // yüksek kalite ön koşulu: WebGL2 + ME programı; ek olarak renderlanabilir doku (ensure içinde) gerekir
      try { copy = program(COPY_FS); me = program(ME_FS); st.canHigh = true; } catch (e) { st.note = `Hareket kestirimi kullanılamıyor: ${e.message}`; }
    } else st.note = 'WebGL2 yok: düşük kalite (düz karışım)';
    const frames = [texture(0), texture(0)]; // video kareleri (halka)
    let small = [null, null], motion = null, asz = [0, 0], grid = [0, 0], vsize = [0, 0];
    let pI = 0, cI = 0, mReady = false;
    const ext = v2 ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    let query = null, queryDone = false, gpu = null;

    // zaman çizelgesi ve ölçüm
    const tl = { arrival: 0, interval: 0, media: -1, deltas: [], outs: [], lastOut: 0, cpu: 0, work: 0, sinceDecision: 0, start: 0 };
    const ema = (prev, v) => (prev == null || prev === 0 ? v : prev + (v - prev) * 0.1);

    function ensure(w, h) { // analiz kaynakları: 1/4 çözünürlük (en çok 480 geniş)
      if (vsize[0] === w && vsize[1] === h) return;
      vsize = [w, h];
      small.forEach(freeTarget); freeTarget(motion); small = [null, null]; motion = null; mReady = false;
      if (!st.canHigh) return;
      asz = analysisSize(w, h);
      grid = asz.map(n => n / 8);
      small = [target(asz[0], asz[1]), target(asz[0], asz[1])]; motion = target(grid[0], grid[1]);
      if (!small[0].ok || !small[1].ok || !motion.ok) { st.canHigh = false; st.note = 'Renderlanabilir doku yok: düşük kalite'; apply(); }
    }
    function apply() { st.quality = decideQuality({ pref: st.over ? 'low' : st.pref, canHigh: st.canHigh, ms: 0, budget: 1 }).quality; }
    apply();
    const upload = i => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, frames[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Video dokusu okunamadı');
    };
    const pass = (pr, t, w, h) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null); gl.viewport(0, 0, w, h); gl.useProgram(pr.pg); };

    // Yeni video karesi: yükle, küçült, (yüksek kalitede) hareket kestir.
    function newFrame(meta, forceCut) {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h || video.readyState < 2) return;
      const t0 = now(), media = meta?.mediaTime ?? video.currentTime, rate = video.playbackRate || 1;
      const delta = media - tl.media;
      const cut = forceCut || tl.media < 0 || delta <= 0 || delta > 0.5;
      ensure(w, h);
      const next = cut ? (st.frames ? cI : 0) : 1 - cI;
      upload(next);
      if (cut) { pI = cI = next; mReady = false; tl.interval = 0; }
      else {
        pI = cI; cI = next; tl.interval = clamp(delta / rate * 1000, 8, 250);
        tl.deltas.push(delta); if (tl.deltas.length > 30) tl.deltas.shift();
      }
      tl.media = media; tl.arrival = Number.isFinite(meta?.expectedDisplayTime) ? meta.expectedDisplayTime : t0; st.frames++;
      if (small[0]) { // küçük kopya her zaman güncel (kalite sonradan yükselirse hazır olsun)
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, frames[cI]);
        pass(copy, small[cI], asz[0], asz[1]); gl.uniform1i(copy.u.img, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (st.quality === 'high' && !cut && !bypassInterpolation(estimateFps(tl.deltas) * rate, estimateHz(tl.outs))) {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, small[cI].tx);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, small[pI].tx);
          pass(me, motion, grid[0], grid[1]);
          gl.uniform1i(me.u.cur, 0); gl.uniform1i(me.u.prev, 1); gl.uniform2f(me.u.asz, asz[0], asz[1]); gl.uniform2f(me.u.grid, grid[0], grid[1]);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          mReady = true;
        }
      }
      tl.work = ema(tl.work, now() - t0);
      opts.onFrame?.();
    }

    function render(t) {
      const t0 = now(), w = canvas.width, h = canvas.height;
      if (!w || !h || !st.frames) return false;
      if (query && queryDone && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu = ema(gpu, gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(query); query = null;
      }
      const timed = ext && !query;
      if (timed) { query = gl.createQuery(); queryDone = false; gl.beginQuery(ext.TIME_ELAPSED_EXT, query); }
      const useM = st.quality === 'high' && mReady;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, frames[pI]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, frames[cI]);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, useM ? motion.tx : frames[cI]);
      pass(fin, null, w, h);
      gl.uniform1i(fin.u.pv, 0); gl.uniform1i(fin.u.cu, 1); gl.uniform1i(fin.u.mv, 2);
      gl.uniform1f(fin.u.t, t); gl.uniform1f(fin.u.k, st.k); gl.uniform1f(fin.u.hq, useM ? 1 : 0);
      gl.uniform2f(fin.u.asz, asz[0] || 1, asz[1] || 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (timed) { gl.endQuery(ext.TIME_ELAPSED_EXT); queryDone = true; }
      if (checks++ < 3 || checks % 120 === 0) if (gl.getError() !== gl.NO_ERROR) throw new Error('Video çizilemedi');
      tl.cpu = ema(tl.cpu, now() - t0);
      if (!ready) { ready = true; canvas.style.visibility = 'visible'; opts.onReady?.(); }
      return true;
    }

    function stopLoop() {
      running = false;
      if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      if (rvfc != null && hasRvfc) { video.cancelVideoFrameCallback(rvfc); rvfc = null; }
    }
    function review(n) { // bütçe kararı (her ~60 çıkış karesinde)
      if (tl.outs.length > 60) tl.outs.shift();
      if (++tl.sinceDecision < 60 || st.frames < 10) return;
      tl.sinceDecision = 0;
      if (st.over || st.pref === 'low' || !st.canHigh) return;
      const ms = stats().ms, d = decideQuality({ pref: st.pref, canHigh: st.canHigh, ms, budget: stats().budgetMs });
      if (st.outFrames > 120 && d.over) { st.over = true; apply(); mReady = false; }
    }
    function tick() {
      raf = null; if (!running) return;
      if (video.paused || video.ended || document.hidden) { running = false; return; }
      try {
        const n = now();
        if (!hasRvfc && video.currentTime !== tl.media) newFrame(null, false);
        if (tl.lastOut) { tl.outs.push(n - tl.lastOut); }
        tl.lastOut = n; st.outFrames++;
        render(snapT(frameT(interpT(n, tl.arrival, tl.interval), estimateFps(tl.deltas) * (video.playbackRate || 1), estimateHz(tl.outs)), st.quality));
        review(n);
      } catch (e) { fail(e); return; }
      raf = requestAnimationFrame(tick);
    }
    function onVideoFrame(_, meta) {
      rvfc = null; if (!running) return;
      try { newFrame(meta, false); } catch (e) { fail(e); return; }
      rvfc = video.requestVideoFrameCallback(onVideoFrame);
    }
    function snapshot() { // duraklatılmış/yeniden boyutlanmış: geçerli kareyi t=1 ile çiz
      try { if (video.readyState >= 2) { newFrame(null, true); render(1); } } catch (e) { fail(e); }
    }
    function stats() {
      const outFps = tl.outs.length >= 5 ? +(1000 / (tl.outs.reduce((a, b) => a + b, 0) / tl.outs.length)).toFixed(1) : 0;
      const hz = estimateHz(tl.outs), srcFps = estimateFps(tl.deltas), cpu = tl.cpu + tl.work * (srcFps && outFps ? Math.min(1, srcFps / outFps) : 1);
      return { quality: st.quality, pref: st.pref, over: st.over, note: st.note, srcFps, outFps, hz, budgetMs: +budgetMs(hz).toFixed(2), ms: +Math.max(cpu, gpu ?? 0).toFixed(2), gpu: gpu != null, latencyMs: bypassInterpolation(srcFps * (video.playbackRate || 1), hz) ? 0 : Math.round(latencyMs(srcFps * (video.playbackRate || 1))), frames: st.frames, v2 };
    }

    return {
      start() {
        if (dead || running) return;
        if (video.paused || video.ended || document.hidden) { if (!document.hidden) snapshot(); return; }
        running = true; tl.lastOut = 0; tl.sinceDecision = 0;
        if (hasRvfc) rvfc = video.requestVideoFrameCallback(onVideoFrame);
        raf = requestAnimationFrame(tick);
      },
      stop: stopLoop,
      still() { stopLoop(); if (!dead && st.frames) { try { render(1); } catch (e) { fail(e); } } },
      setK(k) { if (Number.isFinite(k)) st.k = k; },
      setQuality(q) {
        if (!['auto', 'high', 'low'].includes(q) || q === st.pref) return;
        st.pref = q; st.over = false; apply(); mReady = false; tl.sinceDecision = 0; st.outFrames = 0;
      },
      redraw() { if (!running && st.frames) { try { render(1); } catch (e) { fail(e); } } },
      reset() { tl.media = -1; tl.deltas = []; tl.interval = 0; st.over = false; apply(); mReady = false; },
      stats,
      destroy() {
        if (dead) return; dead = true; stopLoop();
        canvas.removeEventListener?.('webglcontextlost', onLost);
        try {
          frames.forEach(t => gl.deleteTexture(t)); small.forEach(freeTarget); freeTarget(motion);
          for (const p of [fin, copy, me]) if (p) gl.deleteProgram(p.pg);
          gl.deleteBuffer(buffer); if (query) gl.deleteQuery(query);
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        } catch {}
      }
    };
  }

  globalThis.UltraFillFluid = Object.freeze({ create, interpT, frameT, snapT, bypassInterpolation, analysisSize, estimateFps, estimateHz, budgetMs, latencyMs, decideQuality, capSize, MAX_W, MAX_H });
})();
