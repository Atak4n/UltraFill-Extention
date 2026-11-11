const api = globalThis.browser ?? globalThis.chrome;
const states = new Map();
let cycling = Promise.resolve();
api.commands.onCommand.addListener(command => {
  if (command !== 'cycle-mode') return;
  cycling = cycling.then(async () => {
    const { mode = 'stretch' } = await api.storage.local.get('mode');
    const modes = ['off', 'stretch', 'flex'];
    await api.storage.local.set({ mode: modes[(modes.indexOf(mode) + 1) % 3] });
  }).catch(console.warn);
});
api.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'status' && sender.tab) {
    states.set(`${sender.tab.id}:${sender.frameId}`, { ...message, tabId: sender.tab.id, frameId: sender.frameId, time: Date.now() });
  }
  if (message?.type === 'get-status') {
    // Etkin olmayan kareler de döner: popup site (host) bilgisini buradan alır; etkin olanı kendisi seçer.
    respond([...states.values()].filter(s => s.tabId === message.tabId && Date.now() - s.time < 6000));
  }
});
api.tabs.onRemoved.addListener(tabId => {
  for (const [key, state] of states) if (state.tabId === tabId) states.delete(key);
});
