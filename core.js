/* UltraFill saf hesap fonksiyonları: tarayıcı/DOM API'si yok; klasik script ve Node testleri için. */
(() => {
  const MODES = ['off', 'stretch', 'flex'];
  const CROPS = Object.freeze({ '4:3': 4 / 3, '16:10': 16 / 10, '16:9': 16 / 9, '18:9': 2, '21:9': 21 / 9, '32:9': 32 / 9 });
  const DEFAULTS = Object.freeze({
    mode: 'stretch', strength: 1, zoom: 1, panX: 0, panY: 0, crop: 'none',
    brightness: 0, contrast: 0, saturation: 0, shadows: 0, sharpness: 0,
    hdr: false, hdrStrength: 50,
    fluid: false, fluidQuality: 'auto' // Akıcılık (deneysel): varsayılan kapalı, profiller dokunmaz
  });
  const FLUID_QUALITIES = ['auto', 'high', 'low'];
  const RANGES = {
    strength: [0, 1], zoom: [1, 3], panX: [-100, 100], panY: [-100, 100],
    brightness: [-100, 100], contrast: [-100, 100], saturation: [-100, 100], shadows: [-100, 100], sharpness: [0, 100],
    hdrStrength: [0, 100]
  };
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const fmt = n => +n.toFixed(4);

  function normalize(data) {
    const d = data && typeof data === 'object' ? data : {};
    const out = { ...DEFAULTS };
    if (MODES.includes(d.mode)) out.mode = d.mode;
    for (const [key, [lo, hi]] of Object.entries(RANGES)) {
      const v = num(d[key]);
      if (!Number.isNaN(v)) out[key] = Math.min(hi, Math.max(lo, v));
    }
    if (typeof d.crop === 'string' && Object.hasOwn(CROPS, d.crop)) out.crop = d.crop;
    out.hdr = d.hdr === true;
    out.fluid = d.fluid === true;
    if (FLUID_QUALITIES.includes(d.fluidQuality)) out.fluidQuality = d.fluidQuality;
    return out;
  }

  // Doğrusal modda video kutusu hedefi zaten dolduruyor: kırpma = ortadan büyütme. [sx, sy] >= 1.
  function cropScale(videoAspect, crop) {
    const r = CROPS[crop];
    if (!r || !(videoAspect > 0) || !Number.isFinite(videoAspect)) return [1, 1];
    return r >= videoAspect ? [1, r / videoAspect] : [videoAspect / r, 1];
  }

  // Zoom + kırpma oranı + kaydırma tek CSS transform'u. Nötrse ''.
  function viewTransform(s, videoAspect) {
    const [cx, cy] = cropScale(videoAspect, s.crop);
    const sx = cx * s.zoom, sy = cy * s.zoom;
    const limX = (sx - 1) / 2 * 100, limY = (sy - 1) / 2 * 100;
    const clamp = (v, lim) => Math.min(lim, Math.max(-lim, v));
    const tx = clamp(-s.panX / 100 * limX, limX);
    const ty = clamp(-s.panY / 100 * limY, limY);
    if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return '';
    return `translate(${fmt(tx)}%, ${fmt(ty)}%) scale(${fmt(sx)}, ${fmt(sy)})`;
  }

  // HDR benzeri ton genişletme eğrisi (piksel okumaz): f(x) = x + a·x²(1−x). f(0)=0, f(1)=1, a≤0.9 iken monoton;
  // gölgeler (x²) neredeyse korunur, üst-orta/parlak tonlar açılır. Güç 0 → birim fonksiyon.
  function hdrCurve(strength, points = 17) {
    const t = Math.min(100, Math.max(0, num(strength) || 0)) / 100, a = 0.9 * t;
    const values = Array.from({ length: points }, (_, i) => { const x = i / (points - 1); return fmt(x + a * x * x * (1 - x)); });
    return { values, sat: fmt(1 + 0.25 * t) };
  }
  const hdrOn = s => s.hdr && s.hdrStrength > 0;

  function imageSpec(s) {
    const css = [];
    if (s.brightness) css.push(`brightness(${fmt(1 + s.brightness / 100)})`);
    if (s.contrast) css.push(`contrast(${fmt(1 + s.contrast / 100)})`);
    if (s.saturation) css.push(`saturate(${fmt(1 + s.saturation / 100)})`);
    return {
      css: css.join(' '),
      gamma: s.shadows ? fmt(2 ** (-s.shadows / 100)) : null, // <1 gölgeleri açar
      sharp: s.sharpness > 0 ? fmt(s.sharpness / 100 * 0.8) : null,
      hdr: hdrOn(s) ? hdrCurve(s.hdrStrength) : null
    };
  }
  function filterCss(s, svgId) {
    const spec = imageSpec(s);
    return [spec.gamma != null || spec.sharp != null || spec.hdr ? `url(#${svgId})` : '', spec.css].filter(Boolean).join(' ');
  }
  const imageNeutral = s => !s.brightness && !s.contrast && !s.saturation && !s.shadows && !s.sharpness && !hdrOn(s);

  const NAMED = [[1, '1:1'], [4 / 3, '4:3'], [16 / 10, '16:10'], [16 / 9, '16:9'], [2, '18:9'], [21 / 9, '21:9'], [32 / 9, '32:9']];
  function describeAspect(w, h) {
    if (!(w > 0) || !(h > 0)) return null;
    const a = w / h, hit = NAMED.find(([r]) => Math.abs(r - a) / r < 0.02);
    return { aspect: a, ratio: hit ? hit[1] : `${a.toFixed(2)}:1`, resolution: `${w}×${h}` };
  }

  // "off" = görüntü kaydırıcılarının nötr (varsayılan) hali; mod/yakınlaştırmaya dokunmaz.
  const NEUTRAL = Object.freeze(Object.fromEntries(['brightness', 'contrast', 'saturation', 'shadows', 'sharpness', 'hdr', 'hdrStrength'].map(k => [k, DEFAULTS[k]])));
  const PROFILES = Object.freeze({
    off: NEUTRAL,
    film:  { brightness: 0, contrast: 10, saturation: 5, shadows: 10, sharpness: 10, hdr: true, hdrStrength: 40 },
    sport: { brightness: 5, contrast: 10, saturation: 20, shadows: 0, sharpness: 25, hdr: false, hdrStrength: 50 },
    game:  { brightness: 0, contrast: 10, saturation: 15, shadows: 15, sharpness: 35, hdr: true, hdrStrength: 30 },
    music: { brightness: -5, contrast: 0, saturation: 10, shadows: 0, sharpness: 0, hdr: false, hdrStrength: 50 }
  });
  const matchProfile = s => Object.keys(PROFILES).find(k => Object.entries(PROFILES[k]).every(([key, v]) => s[key] === v)) ?? null;
  // Genel ayar + sites[host] geçersiz kılması → etkin ayar (popup kullanır; content.js aynı kuralı uygular).
  const effective = (raw, host) => { const site = raw?.sites?.[host]; return normalize({ ...raw, ...(site && typeof site === 'object' ? site : null) }); };
  const nextMode =mode => MODES[(MODES.indexOf(mode) + 1) % MODES.length];

  // Akıcılık önerilen profiller: yalnız ipucu; hiçbir profil fluid ayarını değiştirmez.
  const FLUID_SUGGESTED = Object.freeze(['sport', 'game']);
  globalThis.UltraFillCore = Object.freeze({ FLUID_QUALITIES, FLUID_SUGGESTED, MODES, CROPS, DEFAULTS, RANGES, PROFILES, normalize, cropScale, viewTransform, imageSpec, filterCss, imageNeutral, hdrCurve, describeAspect, matchProfile, nextMode, effective });
})();
