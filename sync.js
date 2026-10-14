// Google Sheets sync through an Apps Script web app. Offline queue lives in IndexedDB ("outbox").
const Sync = (() => {
  let busy = false, timer = null, fails = 0, last = { state: 'off', at: null, pending: 0, error: '' };
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f(last));
  async function cfg() { return (await DB.get('settings', 'sync')) || { id: 'sync', url: '', secret: '' }; }
  async function status() { const q = await DB.all('outbox'); last.pending = q.length; return last; }
  async function run() {
    if (busy) return;
    const c = await cfg();
    const q = await DB.all('outbox');
    last.pending = q.length;
    if (!c.url) { last.state = 'off'; emit(); return; }
    if (!q.length) { last.state = 'ok'; emit(); return; }
    if (!navigator.onLine) { last.state = 'wait'; last.error = 'Offline. Will send when back online.'; emit(); return; }
    busy = true;
    try {
      const batch = q.slice(0, 50);
      // text/plain keeps this a "simple" request (no CORS preflight, which Apps Script can't answer)
      const r = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret: c.secret, ops: batch.map(o => ({ tab: o.tab, key: o.key, row: o.row, del: !!o.del })) }), redirect: 'follow' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Sheet said no');
      await DB.clearOutbox(batch.map(o => o.seq));
      fails = 0; last = { state: 'ok', at: new Date().toISOString(), pending: q.length - batch.length, error: '' };
      busy = false; emit();
      if (last.pending) return run();
    } catch (e) {
      fails++; busy = false;
      last.state = 'wait'; last.error = String(e.message || e); last.pending = q.length; emit();
      clearTimeout(timer); timer = setTimeout(run, Math.min(300000, 5000 * 2 ** Math.min(fails, 6)));
    }
  }
  addEventListener('online', run);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  setInterval(run, 60000);
  return { run, status, cfg, on: f => listeners.add(f) };
})();
