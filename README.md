# UltraFill

Dependency-free, no-build MV3 WebExtension. Written from scratch; no third-party extension code is used. Modes: off, linear stretch, flex stretch. Default is linear stretch (`stretch`); a saved `off` selection is preserved. Popup settings apply to all tabs; Alt+Shift+F cycles the mode.

## Chrome / Edge

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. **Developer mode** → **Load unpacked** → select this repo folder.
3. Reload any already-open video tabs. Pick the mode from the popup.

## Safari (macOS)

1. Open `safari.zip`.
2. Open `UltraFill.xcodeproj` in Xcode; select your Signing team if needed.
3. Run with **⌘R** in Xcode.
4. Under **Safari → Settings → Extensions**, enable UltraFill and grant it site access.
5. If needed, in Safari choose **Develop menu → Allow Unsigned Extensions**. Menu names may vary by Safari version.

The resources inside `safari.zip` (`Resources/`) are identical to the extension files in the repo root. Requires a Safari version with MV3 service worker support.

## Mapping

Source coordinate `s ∈ [-1,1]`, screen coordinate `x`:

`x = s * (k + (1-k) * s²)`

`k = 1 - strength * (1 - min(1, sourceAspect/targetAspect))`

At full strength, the physical scale at the center `(targetAspect/sourceAspect)*k = 1`; stretch increases toward the edges. Derivative `k + 3*(1-k)*s² > 0`; the edges are fixed, no cropping occurs. For screen→source sampling, the shader finds the inverse of this monotonic function via a 14-step binary search. Using the curve directly in the screen→source direction would not preserve the center. Invalid values fall back to linear mapping. A narrower target uses linear fill.

## Limits

- DRM/EME, a CORS block, or a shader/WebGL error: falls back to linear. The popup shows the active tab's frame state with roughly a 2-second delay. If the worker restarted, the state may stay empty until the next notification.
- Linear mode uses `object-fit: fill`: it stretches the image linearly, like `scaleX`, but does not scale native controls.
- When native video controls are used, or the video element itself goes fullscreen: only `object-fit: fill` is applied (geometry unchanged); native controls are not hidden via opacity.
- Geometry rule: if the video box already covers the target area (the fullscreen element, the viewport if it is `html`/`body`, or the known player container outside fullscreen), only `object-fit: fill` is applied. If it does not cover it, only the video's ancestor chain is spread to the target. Outside fullscreen, if no container is found, page geometry is left untouched. Container selectors live in the single `PLAYERS` constant in `content.js`; the general rule still works even without a match. Real Chrome/Safari and site testing (YouTube, Netflix, Prime, Apple TV+, Disney+) has not been done yet.
- Each frame picks its own largest visible, preferably playing video. There is no single global video selection across cross-origin frames. Open shadow DOM is scanned; closed shadow roots cannot be accessed, so videos inside them cannot be found. Picture-in-picture and browser internal pages are not supported.
- Black bars baked into the video itself are not removed; this is preserved per the no-cropping principle. Protected streams that silently return a black image on pixel access may not be detectable in every browser.
- Rendering stops continuously on pause and in hidden tabs. Canvas DPR is capped at 2. Flex mode uses the GPU and deliberately distorts the edges.
- No network requests, telemetry, or external servers. `<all_urls>` is only for finding video; you can narrow the site permission from your browser settings.

## Panel (extension window) and buttons (v1.1.1)

- The window writes to `storage.local`, and the active tab applies it instantly. The active tab's host and video/DRM state come through the existing `status` messaging via `background.js` (no new permission); if unavailable, the field shows "—".
- The button inside YouTube's `.ytp-right-controls`, and the floating button above the video on other sites, cycles the mode with a single click only (Off → Fill → Flex). No right-click/long-press. Added once; reappears when the control bar is refreshed by an SPA. Alt+Shift+F still works the same way.
- 1.1.1 fix: switching to "Off" caused the video to stick to the left. Root cause: while filling, the `inset`/`margin` shorthand properties were being written, which overrode the site's inline `left/top` values; on teardown only the shorthand was removed, so `left/top` was never restored. Now the longhand properties (`top/right/bottom/left`, `margin-*`) are written and reverted individually (`test/stale.test.mjs` A5, with a mock CSSOM; not verified in a real Chrome). Linear stretch and image filters keep working.
- Out of scope (1.2.0): frame interpolation (added in 1.3.0 as Fluid, below).


HDR boost (Image tab, off by default, strength 50%):
- Does NOT provide real HDR output. Without reading any pixels, it applies an SDR tone curve (brightens highlights, preserves shadows, slight saturation boost) via a hidden SVG filter added to the `--uf-filter` chain. If the screen reports `(dynamic-range: high)`, the panel says "HDR screen detected", otherwise "SDR screen: tone expansion"; in both cases the output is the same SDR filter.
- Because no pixels are read, it also applies under DRM/CORS. Limit: under hardware-protected playback (e.g. some DRM paths) the browser may ignore the CSS/SVG filter; in that case the effect is invisible.
- When neutral (off, or strength 0), no filter, attribute, or SVG remains.


## Fluid (v1.3.0, experimental, off by default)

The Fluid tab: makes a low-fps video (24/30) look smooth on a high-refresh-rate screen (60/120/144 Hz) by generating intermediate frames. The panel shows "source → output FPS" (e.g. `24 → 144`), processing time / budget ms (budget = 1000 / refresh rate), and a status (Fluid / Budget exceeded / DRM: unavailable ...). The setting lives in `storage.local` and can be overridden per site. Profiles do not touch this setting; enabling it is recommended for Sport and Game content, but it is your choice.
- Method: each new video frame is loaded into two textured ring buffers; every screen frame draws position `t` between the previous and current frame. High quality (WebGL2 only): a motion field is extracted via 8x8 block matching (±6 pixels, SAD) at 1/4 resolution; the two frames are shifted by `t·v` and `(1−t)·v` and blended, falling back to a plain blend in blocks where the match is unreliable. Low quality (WebGL1 or fallback): a plain blend of the two frames (ghosting/double image possible). Fill/flex mode and zoom/filters are preserved on the canvas.
- Latency: one source frame (~42 ms at 24 fps, ~33 ms at 30 fps). The image lags behind the audio by this much; the panel shows the approximate value.
- Limit: Fluid turns off under DRM (`mediaKeys`), cross-origin video without CORS, no WebGL or a lost context, or when the video element itself is fullscreen; the video falls back to CSS fill and the reason is shown in the panel. DRM cannot be bypassed.
- GPU load: canvas resolution is capped at DPR ≤ 2 and at most 2560×1440; motion estimation only runs on a new video frame. Timing is measured on the CPU side (does not fully reflect GPU execution); if `EXT_disjoint_timer_query_webgl2` is available, GPU time is measured too. If the budget is exceeded, quality automatically drops to low and does not rise again (changing the quality setting resets it). If the source fps is close to the screen's refresh rate there is no gain, only added latency; turn it off. The draw loop stops on pause, in hidden tabs, and on `ended`.

## Checks

```sh
node test/core.test.mjs
node test/stale.test.mjs
node test/ui.test.mjs
node test/popup.test.mjs
node test/mapping.test.mjs
node test/validate.mjs
node test/content.test.mjs
node test/scan.test.mjs
node test/fallback.test.mjs
node test/geometry.test.mjs
node test/fluid.test.mjs
node test/hdr.test.mjs
node --check content.js
```

Manual: on a 16:9 test video, a 21:9/32:9 container, edge markers and a center circle; pause/resume, seek, SPA video change, fullscreen, slider, two-tab sync, shortcut, DRM/CORS fallback, and original styles being restored when turned off. Real browser/GPU verification is not covered by these automated tests.
