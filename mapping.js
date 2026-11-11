/* Clean-room panorama mapping; usable as classic script and in Node tests. */
(() => {
  function coefficient(sourceAspect, targetAspect, strength = 1) {
    if (![sourceAspect, targetAspect, strength].every(Number.isFinite) || sourceAspect <= 0 || targetAspect <= 0) return 1;
    // Wider-than-target media stays linear: a cubic with k > 3 loses monotonicity.
    const ratio = Math.min(1, Math.max(0.001, sourceAspect / targetAspect));
    return 1 - Math.min(1, Math.max(0, strength)) * (1 - ratio);
  }
  function mapCoordinate(x, k) {
    const safeK = Number.isFinite(k) && k > 0 && k <= 1 ? k : 1;
    return x * (safeK + (1 - safeK) * x * x);
  }
  function sourceCoordinate(output, k) {
    if (output === 0 || Math.abs(output) === 1) return output;
    let low = -1, high = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (low + high) / 2;
      if (mapCoordinate(mid, k) < output) low = mid; else high = mid;
    }
    return (low + high) / 2;
  }
  globalThis.UltraFillMapping = Object.freeze({ coefficient, mapCoordinate, sourceCoordinate });
})();
