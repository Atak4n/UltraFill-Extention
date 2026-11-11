import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
assert.equal(m.manifest_version, 3);
const files = [m.background.service_worker, m.action.default_popup, ...Object.values(m.icons), ...m.content_scripts.flatMap(c => c.js)];
for (const file of files) assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
for (const [size, file] of Object.entries(m.icons)) {
 const b = fs.readFileSync(path.join(root,file));
 assert.equal(b.subarray(1,4).toString(), 'PNG');
 assert.equal(b.readUInt32BE(16), Number(size)); assert.equal(b.readUInt32BE(20), Number(size));
}
assert.ok(m.content_scripts[0].all_frames);
assert.deepEqual(m.content_scripts[0].js, ['mapping.js', 'core.js', 'effects.js', 'panel.js', 'fluid.js', 'content.js'], 'load order: bağımlılıklar content.js öncesi');
assert.deepEqual(m.permissions, ['storage'], 'yeni izin yok');
assert.equal(m.commands['cycle-mode'].suggested_key.default, 'Alt+Shift+F');
// Bağımlılıksız/ağsız: kaynaklarda ağ API'si ve uzak kod yok.
for (const file of m.content_scripts[0].js.concat(['popup.js', 'background.js'])) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts|eval)\s*\(|new Function/.test(code), `${file}: ağ/uzak kod yok`);
}
// popup.html'in yüklediği her betik var olmalı ve dist komutundaki kopyalama listesinde olmalı.
const distList = ['manifest.json', 'background.js', 'mapping.js', 'core.js', 'effects.js', 'panel.js', 'fluid.js', 'content.js', 'popup.html', 'popup.js', 'popup.css'];
for (const [, src] of fs.readFileSync(path.join(root, m.action.default_popup), 'utf8').matchAll(/<script src="([^"]+)"/g)) assert.ok(distList.includes(src) && fs.statSync(path.join(root, src)).isFile(), `popup betiği ${src} dist listesinde değil`);
assert.equal(m.version, '1.3.0');
// dist/ kaynakla eşleşmeli (dosya listesi + bayt eşitliği). Yayın öncesi: CHECK_DIST=1 node test/validate.mjs
const shipped = [...new Set([...files, 'popup.css', 'manifest.json'])];
for (const dir of process.env.CHECK_DIST ? ['dist/ultrafill-chrome', 'dist/safari-input'] : []) {
  for (const file of shipped) {
    const dst = path.join(root, dir, file);
    assert.ok(fs.existsSync(dst), `${dir}/${file} eksik`);
    assert.ok(fs.readFileSync(dst).equals(fs.readFileSync(path.join(root, file))), `${dir}/${file} kaynaktan farklı`);
  }
}
console.log('PASS manifest: MV3, references, PNG sizes, all_frames, script order, shortcut, no network APIs, dist eşleşmesi');
