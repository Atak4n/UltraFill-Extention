// Test yardımcısı: gerçek CSS motoru yok. content.js'in enjekte ettiği !important kurallarının etkisini (öznitelik -> değer) modeller.
// Satır içi stil (el.style) ham kalır; "hesaplanmış" değer kural > satır içi sırasıyla okunur (!important kuralı önemsiz satır içini yener).
export const RULES = el => {
  const has = k => el.getAttribute(k) !== null, o = {};
  if (has('data-uf-rel')) o.position = 'relative';
  if (has('data-uf-branch') || el.getAttribute('data-uf') === 'fill') Object.assign(o, { position: 'absolute', top: '0', right: '0', bottom: '0', left: '0', width: '100%', height: '100%' });
  if (has('data-uf-fit')) o['object-fit'] = 'fill';
  if (has('data-uf-hide')) o.opacity = '0';
  if (has('data-uf-clip')) o.overflow = 'hidden';
  return o;
};
export const css = (el, k) => RULES(el)[k] ?? el.style.getPropertyValue(k);
// Salt stub öğelere öznitelik API'si + hesaplanmış okuma ekler (stub'ların satır içi stili ham kalır: el.style.raw).
export function withAttrs(el, tag = 'div') {
  const attrs = new Map(), raw = el.style.getPropertyValue.bind(el.style);
  Object.assign(el, {
    localName: tag, getAttribute: k => attrs.get(k) ?? null, setAttribute: (k, v) => { attrs.set(k, String(v)); }, removeAttribute: k => { attrs.delete(k); },
    hasAttribute: k => (k === 'controls' && 'controls' in el ? !!el.controls : attrs.has(k))
  });
  el.style.raw = raw; el.style.getPropertyValue = k => RULES(el)[k] ?? raw(k);
  return el;
}
