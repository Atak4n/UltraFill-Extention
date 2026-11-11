// Eklenti popup'ı: tam panel (panel.js mountInline). Ayarlar storage.local'a yazılır; etkin sekme anında uygular.
// Sekme durumu (host, video bilgisi) background'un get-status yanıtından gelir; alınamazsa alanlar "—" kalır.
const api = globalThis.browser ?? globalThis.chrome;
const core = globalThis.UltraFillCore, ui = globalThis.UltraFillPanel;
const NO_INFO = { active: false, effective: '', reason: '', video: null };
let raw = {}, state = null, view = null, pending = {}, timer = null;

const host = () => state?.host ?? '';
const siteOf = () => { const s = raw.sites?.[host()]; return s && typeof s === 'object' ? s : null; };
const settings = () => core.effective(raw, host());

function flush() {
  clearTimeout(timer); timer = null;
  const out = pending; pending = {};
  if (Object.keys(out).length) try { api.storage.local.set(out)?.catch(() => {}); } catch {}
}
function write(next, keys) {
  raw = next; keys.forEach(k => { pending[k] = raw[k]; });
  clearTimeout(timer); timer = setTimeout(flush, 120);
}
const hooks = {
  doc: document,
  getSettings: settings,
  getScope: () => ({ host: host(), site: !!siteOf() }),
  getInfo: () => (state?.info ? { ...NO_INFO, ...state.info } : { ...NO_INFO, effective: settings().mode }),
  change(patch) {
    if (siteOf()) write({ ...raw, sites: { ...raw.sites, [host()]: { ...siteOf(), ...patch } } }, ['sites']);
    else write({ ...raw, ...patch }, Object.keys(patch));
  },
  setSite(on) {
    if (!host()) return;
    const sites = { ...(raw.sites && typeof raw.sites === 'object' ? raw.sites : {}) };
    if (on) sites[host()] = { ...settings() }; else delete sites[host()];
    write({ ...raw, sites }, ['sites']);
  },
  resetAll() { hooks.change({ ...core.DEFAULTS }); }
};

async function loadStatus() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const list = await api.runtime.sendMessage({ type: 'get-status', tabId: tab?.id });
    state = Array.isArray(list) ? list.find(s => s.active) ?? list.find(s => s.frameId === 0) ?? list[0] ?? null : null;
  } catch { state = null; }
}
async function loadSettings() {
  try { const data = await api.storage.local.get(null); raw = data && typeof data === 'object' ? data : {}; } catch { raw = {}; }
}

async function start() {
  const app = document.getElementById('app');
  if (!app || !core || !ui) return;
  await Promise.all([loadSettings(), loadStatus()]);
  view = ui.mountInline(hooks, app);
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || Object.keys(pending).length) return; // bekleyen yerel değişiklik: eski yankı ezmesin
    loadSettings().then(() => view.refresh());
  });
  setInterval(() => { loadStatus().then(() => view.refresh()); }, 2000);
  addEventListener('pagehide', flush);
}
start();
