// Google Sheets two-way sync through an Apps Script web app. Offline queue lives in IndexedDB ("outbox").
// Push: every save goes to the outbox, then to the sheet. Pull: the sheet is the shared source of truth;
// rows are merged by key with last-write-wins on updatedAt, and unsent local edits always win.
const Sync = (() => {
  let busy = false, pulling = false, timer = null, fails = 0, last = { state: 'off', at: null, pulledAt: null, pending: 0, error: '' };
  const listeners = new Set(), mergeListeners = new Set();
  const emit = () => listeners.forEach(f => f(last));
  // Sheet tab -> IndexedDB store. Owed (debts) is local-only in v2; Orders is v1 legacy.
  const STORE = { Shifts: 'shifts', Checks: 'checks', Bank: 'bank', Payroll: 'payroll', Delivery: 'delivery', ShiftTimes: 'settings' };
  async function cfg() { return (await DB.get('settings', 'sync')) || { id: 'sync', url: '', secret: '' }; }
  async function meta() { return (await DB.get('settings', 'syncmeta')) || { id: 'syncmeta', since: '', pulledAt: null }; }
  async function status() { const q = await DB.all('outbox'); last.pending = q.length; if (!last.pulledAt) last.pulledAt = (await meta()).pulledAt; return last; }
  const post = (c, body) => fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret: c.secret, ...body }), redirect: 'follow' }).then(r => r.json());
  // Sheet row -> app record
  function toItem(tab, row) {
    const store = STORE[tab]; if (!store || !row || row.key === undefined || row.key === '') return null;
    const id = String(row.key), rec = { id };
    for (const [k, v] of Object.entries(row)) if (k !== 'key' && k !== 'deleted') rec[k] = v;
    if (store === 'settings' && !/^shift-/.test(id)) return null; // only shift times live in settings on the sheet
    return { tab, store, id, updatedAt: String(row.updatedAt || ''), del: !!row.deleted, rec };
  }
  async function pull() {
    if (pulling) return 0;
    const c = await cfg();
    if (!c.url || !navigator.onLine) return 0;
    pulling = true;
    try {
      const m = await meta();
      const j = await post(c, { pull: true, since: m.since || '' });
      if (!j.ok) throw new Error(j.error || 'Sheet said no');
      const items = [];
      for (const [tab, rows] of Object.entries(j.tabs || {})) for (const r of rows || []) { const it = toItem(tab, r); if (it) items.push(it); }
      const changed = items.length ? await DB.merge(items) : 0;
      // Ask again from a little before the server's clock next time, so nothing written mid-pull is missed.
      const now = j.now || new Date().toISOString();
      const since = new Date(new Date(now).getTime() - 120000).toISOString();
      last.pulledAt = new Date().toISOString();
      await DB.put('settings', { id: 'syncmeta', since, pulledAt: last.pulledAt });
      if (changed) for (const f of mergeListeners) { try { await f(changed); } catch (e) { console.error(e); } }
      emit();
      return changed;
    } catch (e) {
      last.error = String(e.message || e); emit(); return 0;
    } finally { pulling = false; }
  }
  async function run() {
    if (busy) return;
    const c = await cfg();
    const q = await DB.all('outbox');
    last.pending = q.length;
    if (!c.url) { last.state = 'off'; emit(); return; }
    if (!navigator.onLine) { last.state = 'wait'; last.error = 'Offline. Will send when back online.'; emit(); return; }
    if (!q.length) { last.state = 'ok'; emit(); await pull(); return; }
    busy = true;
    try {
      const batch = q.slice(0, 50);
      // text/plain keeps this a "simple" request (no CORS preflight, which Apps Script can't answer)
      const j = await post(c, { ops: batch.map(o => ({ tab: o.tab, key: o.key, row: o.row, del: !!o.del, at: o.at })) });
      if (!j.ok) throw new Error(j.error || 'Sheet said no');
      await DB.clearOutbox(batch.map(o => o.seq));
      fails = 0; last = { ...last, state: 'ok', at: new Date().toISOString(), pending: q.length - batch.length, error: '' };
      busy = false; emit();
      if (last.pending) return run();
      await pull(); // after each successful push, bring in what other devices wrote
    } catch (e) {
      fails++; busy = false;
      last.state = 'wait'; last.error = String(e.message || e); last.pending = q.length; emit();
      clearTimeout(timer); timer = setTimeout(run, Math.min(300000, 5000 * 2 ** Math.min(fails, 6)));
    }
  }
  // First connect (or a new link): forget the pull cursor so the next pull reads the whole sheet.
  async function resetPull() { await DB.put('settings', { id: 'syncmeta', since: '', pulledAt: null }); last.pulledAt = null; }
  addEventListener('online', run);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  setInterval(() => { if (!document.hidden) run(); }, 60000);
  return { run, pull, status, cfg, resetPull, on: f => listeners.add(f), onMerge: f => mergeListeners.add(f) };
})();
