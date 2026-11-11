import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('  const PLAYERS'), source.indexOf('  const fill ='));
const scan = helpers + source.slice(source.indexOf('  function scan() {'), source.indexOf('  function schedule()'));
assert.ok(scan.includes('candidates.sort'));
for (const paused of [true, false]) {
  const video = (width, height) => ({ paused, ended: false, isConnected: true, parentElement: {}, getBoundingClientRect: () => ({ width, height, top: 0, left: 0, bottom: height, right: width }) });
  const small = video(320, 180), large = video(1280, 720);
  let selected;
  vm.runInNewContext(`${scan}\nscan();`, {
    queued: true, settings: { mode: 'stretch' }, current: null,
    document: {}, innerWidth: 1920, innerHeight: 1080,
    getVideos: () => [small, large],
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    cleanup() {}, report() {}, attach: video => { selected = video; }
  });
  assert.equal(selected, large, `larger video wins equal priority (paused=${paused})`);
}
console.log('PASS scan: larger video selected at equal paused and playing priority');
