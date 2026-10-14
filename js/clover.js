/* Clover totals at close-out. The sheet's Apps Script pulls Clover hourly; the app asks it for one day's totals.
   Nothing is filled in until you tap "Use these", and nothing is saved until Save. */
const Clover = (() => {
  const cache = {};
  // adj: { start, end } for the shift being closed out, when its times were adjusted for this day.
  async function day(date, k, adj) {
    const windows = Object.fromEntries(SHIFTS.map(s => { const sp = shiftSpan(date, s.k, s.k === k && adj ? adj : undefined); return [s.k, [+sp.start, +sp.end]]; }));
    const key = date + JSON.stringify(windows);
    if (cache[key] && Date.now() - cache[key].at < 5 * 60000) return cache[key].d;
    const c = await Sync.cfg(); if (!c.url || !navigator.onLine) return null;
    const r = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret: c.secret, clover: date, windows }), redirect: 'follow' });
    const d = await r.json(); if (!d.ok || !d.shifts) return null;
    cache[key] = { at: Date.now(), d }; return d;
  }
  const money = n => (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
  async function card(date, k, p, adj) {
    const el = $('#clover'); if (!el) return;
    let d = null; try { d = await day(date, k, adj); } catch { d = null; }
    const s = d?.shifts?.[k]; if (!s || !(s.card || s.cash) || !$('#clover')) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="ch"><b>From Clover</b><small>${k} shift, ${d.count} payments</small></div><dl><div><dt>Card</dt><dd>${usd(s.card)}</dd></div><div><dt>Cash rung up</dt><dd>${usd(s.cash)}</dd></div></dl><p class="sub">Check against the drawer. Paid outs are not in Clover.</p><button type="button" class="btn" id="usecl">Use these</button>`;
    $('#usecl').onclick = () => { p.f.cc.v = money(s.card); p.f.cash.v = money(s.cash); p.focus('out'); stamp('Filled from Clover'); $('#usecl').textContent = 'Filled in, check and save'; };
  }
  return { day, card };
})();
