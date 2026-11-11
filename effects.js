/* UltraFill SVG görüntü filtreleri; piksel veya ses erişimi yok. */
(() => {
  const core = globalThis.UltraFillCore;
  const SVG = 'http://www.w3.org/2000/svg';
  let counter = 0;
  function create(video) {
    const doc = video.ownerDocument || document;
    const id = `uf-fx-${++counter}`;
    const st = { settings: core.normalize({}), svg: null };
    function syncSvg() {
      const spec = core.imageSpec(st.settings);
      if (spec.gamma == null && spec.sharp == null && !spec.hdr) { st.svg?.remove(); st.svg = null; return; }
      if (!st.svg) {
        const mk = (tag, attrs) => { const e = doc.createElementNS(SVG, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
        st.gamma = ['R', 'G', 'B'].map(c => mk(`feFunc${c}`, { type: 'gamma', amplitude: '1', offset: '0', exponent: '1' }));
        const transfer = mk('feComponentTransfer', {});
        st.gamma.forEach(g => transfer.append(g));
        // HDR ton eğrisi (tablo) + hafif doygunluk; nötr değerler birim dönüşümdür.
        st.hdrFn = ['R', 'G', 'B'].map(c => mk(`feFunc${c}`, { type: 'table', tableValues: '0 1' }));
        const hdrTransfer = mk('feComponentTransfer', {});
        st.hdrFn.forEach(g => hdrTransfer.append(g));
        st.sat = mk('feColorMatrix', { type: 'saturate', values: '1' });
        st.cm = mk('feConvolveMatrix', { order: '3', kernelMatrix: '0 0 0 0 1 0 0 0 0', divisor: '1', preserveAlpha: 'true' });
        const filter = mk('filter', { id, 'color-interpolation-filters': 'sRGB' });
        filter.append(transfer, hdrTransfer, st.sat, st.cm);
        st.svg = mk('svg', { width: '0', height: '0', 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;pointer-events:none' });
        st.svg.append(filter);
        // url(#id) video ile aynı ağaç kapsamında çözülür: shadow root içindeyse oraya ekle.
        const root = video.getRootNode?.();
        (root && root.nodeType === 11 ? root : doc.body || doc.documentElement).append(st.svg);
      }
      st.gamma.forEach(g => g.setAttribute('exponent', String(spec.gamma ?? 1)));
      st.hdrFn.forEach(g => g.setAttribute('tableValues', spec.hdr ? spec.hdr.values.join(' ') : '0 1'));
      st.sat.setAttribute('values', String(spec.hdr ? spec.hdr.sat : 1));
      const a = spec.sharp ?? 0;
      st.cm.setAttribute('kernelMatrix', `0 ${-a} 0 ${-a} ${1 + 4 * a} ${-a} 0 ${-a} 0`);
    }

    return {
      sync(next) { st.settings = next; syncSvg(); },
      css() {
        const aspect = video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : NaN;
        return { filter: core.filterCss(st.settings, id), transform: core.viewTransform(st.settings, aspect) };
      },
      destroy() { st.svg?.remove(); st.svg = null; }
    };
  }
  globalThis.UltraFillFx = Object.freeze({ create });
})();
