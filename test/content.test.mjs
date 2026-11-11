import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { withAttrs } from './attrs.mjs';
const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function style() {
  const values = new Map();
  return { setProperty: (k,v,p = '') => values.set(k,[v,p]), getPropertyValue: k => values.get(k)?.[0] || '', getPropertyPriority: k => values.get(k)?.[1] || '', removeProperty: k => values.delete(k) };
}
async function fixture({ fullscreen = true, ready = 4, drawError = false, mode = 'flex' } = {}) {
  const element = (width, height) => withAttrs({ style: style(), clientWidth: width, clientHeight: height, scrollLeft: 0, scrollTop: 0, getBoundingClientRect: () => ({width,height,top:0,left:0,bottom:height,right:width}) });
  const area = element(3440,1440), parent = element(1920,1080), video = element(1920,1080);
  parent.parentElement = area; video.parentElement = parent; area.contains = el => el === video || el === parent;
  const events = new Map(), documentEvents = new Map(), observers = [], canvases = [], frames = new Set();
  let nextFrame = 0, storageListener, settings = {mode, strength:1};
  Object.assign(video, {isConnected:true, paused:true, ended:false, readyState:ready, videoWidth:1920, videoHeight:1080, controls:false, localName:'video', after() {}, addEventListener:(n,f)=>events.set(n,f), removeEventListener:n=>events.delete(n)});
  parent.style.setProperty('width','80%','important'); video.style.setProperty('object-fit','contain');
  const gl = new Proxy({NO_ERROR:0, getError:()=>0, getShaderParameter:()=>true, getProgramParameter:()=>true, drawArrays:()=>{ if(drawError) throw Error('draw failed'); }}, {get:(o,k)=>k in o ? o[k] : ()=>({})});
  const document = {hidden:false, documentElement:{}, body:{}, fullscreenElement:fullscreen ? area : null, querySelectorAll:()=>[video], addEventListener:(n,f)=>documentEvents.set(n,f), createElement:()=>{
    const canvas = {style:{},setAttribute(){},addEventListener(){},remove(){this.removed=true;},getContext:()=>gl}; canvases.push(canvas); return canvas;
  }};
  const api = {runtime:{sendMessage:async()=>{}},storage:{local:{get:async()=>settings},onChanged:{addListener:fn=>storageListener=fn}}};
  vm.runInNewContext(source, {chrome:api,document,console,queueMicrotask,innerHeight:1500,innerWidth:3500,devicePixelRatio:1,UltraFillMapping:{coefficient:()=>.75},getComputedStyle:()=>({position:'static',zIndex:'auto',display:'block',visibility:'visible'}),MutationObserver:class {
    constructor(fn){this.fn=fn;observers.push(this);} observe(target,options){this.target=target;this.options=options;this.active=true;} disconnect(){this.active=false;}
  },ResizeObserver:class {observe(){} disconnect(){}},requestAnimationFrame:()=>{frames.add(++nextFrame);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),addEventListener(){},setInterval(){}});
  await flush();
  return {area,parent,video,canvases,frames,events,document,documentEvents,observers, async controls(value){video.controls=value; observers.filter(o=>o.active && o.target===video).forEach(o=>o.fn([]));await flush();},async off(){settings={mode:'off'};storageListener({mode:{}},'local');await flush();}};
}
for (const mode of ['flex','stretch']) {
  const f = await fixture({mode});
  assert.equal(f.parent.style.getPropertyValue('width'),'100%');
  assert.equal(f.video.style.getPropertyValue('position'),'absolute');
  if(mode==='flex') {assert.equal(f.canvases[0].style.width,'3440px');assert.equal(f.canvases[0].style.height,'1440px');}
  await f.off();
  assert.equal(f.parent.style.getPropertyValue('width'),'80%');
  assert.equal(f.parent.style.getPropertyPriority('width'),'important');
  assert.equal(f.video.style.getPropertyValue('position'),'');
  assert.equal(f.video.style.getPropertyValue('object-fit'),'contain');
  assert.equal(f.area.style.getPropertyValue('position'),'');
}
{
  const f = await fixture({fullscreen:false});
  assert.equal(f.parent.style.getPropertyValue('width'),'80%');
  assert.equal(f.canvases[0].style.width,'1920px');
  await f.off();
}
{
  const f = await fixture();
  for(let i=0;i<3;i++) {
    await f.controls(true);
    assert.notEqual(f.video.style.getPropertyValue('opacity'),'0');
    assert.equal(f.video.style.getPropertyValue('object-fit'),'fill');
    assert.ok(f.canvases.at(-1).removed);
    await f.controls(false);
    assert.equal(f.video.style.getPropertyValue('opacity'),'0');
    assert.equal(f.observers.filter(o=>o.active && o.target===f.video).length,1);
  }
  await f.off();
  assert.equal(f.observers.filter(o=>o.active && o.target===f.video).length,0);
  assert.equal(f.frames.size,0);
}
{
  const f = await fixture({ready:0});
  assert.equal(f.canvases[0].style.visibility,'hidden');
  assert.equal(f.video.style.getPropertyValue('opacity'),'');
  f.video.readyState=4;f.events.get('loadeddata')();
  assert.equal(f.canvases[0].style.visibility,'visible');
  assert.equal(f.video.style.getPropertyValue('opacity'),'0');
  f.document.fullscreenElement=null;f.documentEvents.get('fullscreenchange')();await flush();
  assert.equal(f.parent.style.getPropertyValue('width'),'80%');
  assert.equal(f.canvases.at(-1).style.width,'1920px');
  await f.off();
}
{
  const f = await fixture({drawError:true});
  assert.equal(f.canvases[0].style.visibility,'hidden');
  assert.ok(f.canvases[0].removed);
  assert.equal(f.video.style.getPropertyValue('opacity'),'');
  await f.off();
}
console.log('PASS content regressions: fullscreen geometry/exit/off, inline isolation, controls toggles/observer cleanup, first draw and draw failure');
