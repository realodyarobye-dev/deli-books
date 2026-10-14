/* NY Grill & Deli Books. Single user, offline first. */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, cents) => (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
const usd = n => (n < 0 ? '-$' : '$') + fmt(Math.abs(n), Math.round(Math.abs(n) * 100) % 100 !== 0);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = s => { const d = parse(s); return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
const short = s => { const d = parse(s); return `${MON[d.getMonth()]} ${d.getDate()}`; };
const SHIFTS = [{ k: 'Morning', t: '6 AM to 2 PM', i: 'AM' }, { k: 'Evening', t: '2 PM to 7 PM', i: 'PM' }, { k: 'Overnight', t: '7 PM to 6 AM', i: 'NT' }];
// The store runs 24/7: before 6 AM still belongs to yesterday's overnight shift.
function bizDate(now = new Date()) { const d = new Date(now); if (d.getHours() < 6) d.setDate(d.getDate() - 1); return iso(d); }
function curShift(now = new Date()) { const h = now.getHours(); return h >= 6 && h < 14 ? 'Morning' : h >= 14 && h < 19 ? 'Evening' : 'Overnight'; }
const weekStart = s => { const d = parse(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return iso(d); };
const typed = v => { if (!v) return '0'; const [a, b] = v.split('.'); return (+a).toLocaleString('en-US') + (b !== undefined ? '.' + b : ''); };
const net = r => (+r.cc || 0) + (+r.cash || 0) + (+r.out || 0);

/* ---------- first run ---------- */
const CATS = ['Meats / Frozen / Deli', 'Pastries', 'Drinks / Beer', 'Miscellaneous'];
// Public build: no business data ships in the code. The owner's numbers come from Setup or "Import my starting data".
const SEED = {
  id: 'main', setupDone: false, rent: 0, rentDueDay: 1, rentPaidMonth: '', weekBudget: 0, deliveryApps: ['Grubhub', 'Uber Eats', 'DoorDash'],
  cats: { 'Meats / Frozen / Deli': 0, 'Pastries': 0, 'Drinks / Beer': 0, 'Miscellaneous': 0 }, managerBonus: 0, theme: 'auto', staff: [], vendors: []
};
async function seed() { if (!(await DB.get('settings', 'main'))) await DB.put('settings', structuredClone(SEED)); }
// Starting data file: { format: "deli-books-seed-1", settings, checks, bank, debts, shifts, payroll, orders, delivery }
async function importData(o) {
  if (!o || o.format !== 'deli-books-seed-1' || !o.settings) throw new Error('This file is not a Deli Books starting data file');
  const set = { ...structuredClone(SEED), ...o.settings, id: 'main', setupDone: true };
  set.cats = { ...SEED.cats, ...(o.settings.cats || {}) };
  await DB.put('settings', set);
  for (const [k, tab] of [['checks', 'Checks'], ['bank', 'Bank'], ['shifts', 'Shifts'], ['payroll', 'Payroll'], ['orders', 'Orders'], ['delivery', 'Delivery'], ['debts', null]])
    for (const r of o[k] || []) if (r && r.id) await DB.put(k, r, tab);
  await load(); Sync.run();
}
function pickImport() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.id = 'importfile'; inp.hidden = true; document.body.append(inp);
  inp.onchange = async () => { try { await importData(JSON.parse(await inp.files[0].text())); stamp('LOADED'); location.hash = 'today'; go(); } catch (e) { toast(String(e.message || e)); } inp.remove(); };
  inp.click();
}

/* ---------- state ---------- */
let S = {};
async function load() {
  const [settings, shifts, checks, bank, payroll, orders, debts, delivery] = await Promise.all(['settings', 'shifts', 'checks', 'bank', 'payroll', 'orders', 'debts', 'delivery'].map(DB.all));
  S = { set: settings.find(x => x.id === 'main'), sync: settings.find(x => x.id === 'sync') || { id: 'sync', url: '', secret: '' }, shifts, checks, bank: bank.sort((a, b) => a.date < b.date ? 1 : -1), payroll, orders, debts, delivery };
  if (S.set && !S.set.deliveryApps) { S.set.deliveryApps = ['Grubhub', 'Uber Eats', 'DoorDash']; await DB.put('settings', S.set); }
  applyTheme();
}
function applyTheme() { const t = S.set?.theme || 'auto'; if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; }
const openChecks = () => S.checks.filter(c => !c.cleared);
const floatAmt = () => openChecks().reduce((a, c) => a + (+c.amount || 0), 0);
const monthKey = s => s.slice(0, 7);
// Rent is always held back from cash (same as the sheet). Marking it paid moves the due date to next month.
function rentInfo() {
  const today = bizDate(), set = S.set, paid = set.rentPaidMonth === monthKey(today);
  const d = parse(today), at = m => { const x = new Date(d.getFullYear(), d.getMonth() + m, 1); x.setDate(Math.min(set.rentDueDay, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; };
  const due = paid ? at(1) : at(0);
  const days = Math.round((due - parse(today)) / 864e5);
  return { owed: set.rent, paid, due: iso(due), days };
}
const shiftRec = (date, k) => S.shifts.find(r => r.id === `${date}|${k}`);
const storeDay = date => S.shifts.filter(r => r.date === date).reduce((a, r) => a + net(r), 0);
const delivDay = date => S.delivery.filter(r => r.date === date).reduce((a, r) => a + (+r.amount || 0), 0);
const dayTotal = date => storeDay(date) + delivDay(date);
const delivRec = (date, a) => S.delivery.find(r => r.id === `${date}|${a}`);

/* ---------- UI helpers ---------- */
let LOGO = '';
const logo = cls => `<div class="lg ${cls || ''}" aria-hidden="true">${LOGO}</div>`;
const tabs = cur => `<nav class="tabs" aria-label="Main">${[['today', 'Today'], ['checks', 'Checks'], ['entry', 'Enter', 1], ['payroll', 'Payroll'], ['orders', 'Orders']]
  .map(([h, l, p]) => `<a href="#${h}" class="${p ? 'plus' : ''}" ${cur === h ? 'aria-current="page"' : ''}>${p ? '<span aria-hidden="true">+</span>' : ''}${l}</a>`).join('')}</nav>`;
const hdr = () => `<header class="top"><div class="brand">${logo()}<div><b>NY Grill &amp; Deli</b><small id="syncline" class="sync"><i></i>Saved on this phone</small></div></div><a class="icon" href="#settings" aria-label="Settings">···</a></header>`;
function stamp(t) { const s = document.createElement('div'); s.className = 'stamp'; s.textContent = t; s.setAttribute('role', 'status'); document.body.append(s); setTimeout(() => s.remove(), 950); navigator.vibrate?.(15); }
function toast(t) { const s = document.createElement('div'); s.className = 'toast'; s.setAttribute('role', 'status'); s.textContent = t; document.body.append(s); setTimeout(() => s.remove(), 2200); }
async function save(store, rec, tab) { await DB.put(store, rec, tab); await load(); Sync.run(); }

/* Number pad sheet. opts: {title, sub, value, decimals, label, onSave(number), extra(html), onDelete} */
function padSheet(o) {
  let v = o.value ? String(o.value) : '';
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="scrim" data-x></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(o.title)}"><div class="grab"></div><h3>${esc(o.title)}</h3>${o.sub ? `<p class="sub">${esc(o.sub)}</p>` : ''}
   <div class="fields"><div class="field on"><span class="k">${esc(o.label || 'Amount')}</span><span class="v" id="pv"></span></div></div>${o.extra || ''}
   <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Delete' : k}">${k}</button>`).join('')}</div>
   <button class="save" data-ok type="button">${esc(o.cta || 'Save')}</button>${o.onDelete ? '<button class="save ghost" data-del type="button">Delete</button>' : ''}</div>`;
  document.body.append(wrap);
  const show = () => wrap.querySelector('#pv').textContent = (o.money === false ? '' : '$') + typed(v);
  show();
  const close = () => { wrap.remove(); removeEventListener('keydown', kd); };
  const press = k => { if (k === '⌫') v = v.slice(0, -1); else if (k === '.') { if (!v.includes('.')) v = (v || '0') + '.'; } else if (!(v.includes('.') && v.split('.')[1].length >= 2) && v.replace('.', '').length < 7) v = v === '0' ? k : v + k; show(); };
  const kd = e => { if (/^[0-9.]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Escape') close(); else if (e.key === 'Enter') wrap.querySelector('[data-ok]').click(); };
  addEventListener('keydown', kd);
  wrap.querySelectorAll('[data-k]').forEach(b => b.onclick = () => press(b.dataset.k));
  wrap.querySelector('[data-x]').onclick = close;
  wrap.querySelector('[data-ok]').onclick = async () => { const r = await o.onSave(parseFloat(v || '0'), wrap); if (r !== false) close(); };
  if (o.onDelete) wrap.querySelector('[data-del]').onclick = async () => { if (!confirm('Delete this for good?')) return; await o.onDelete(); close(); };
  o.wire?.(wrap);
  wrap.querySelector('[data-ok]').focus({ preventScroll: true });
}

/* ---------- screens ---------- */
const V = {};
V.today = () => {
  const today = bizDate(), bank = S.bank[0], fl = floatAmt(), rent = rentInfo();
  const bal = bank ? bank.balance : 0, avail = bal - fl - rent.owed, ahead = avail >= 0;
  const tot = Math.max(bal, fl + rent.owed, 1);
  const vals = SHIFTS.map(s => shiftRec(today, s.k)), nets = vals.map(r => r ? net(r) : 0), mx = Math.max(...nets, 1);
  const ws = weekStart(today), lws = addDays(ws, -7);
  const days = [...Array(7)].map((_, i) => [dayTotal(addDays(ws, i)), dayTotal(addDays(lws, i))]), dlv = [...Array(7)].map((_, i) => delivDay(addDays(ws, i)));
  const dToday = delivDay(today), dWeek = dlv.reduce((a, b) => a + b, 0);
  const tw = days.reduce((a, d) => a + d[0], 0), dayIdx = (parse(today).getDay() + 6) % 7;
  const lwSame = days.slice(0, dayIdx + 1).reduce((a, d) => a + d[1], 0), twSame = days.slice(0, dayIdx + 1).reduce((a, d) => a + d[0], 0);
  const pct = lwSame ? (twSame / lwSame - 1) * 100 : null, wm = Math.max(...days.flat(), 1);
  const spent = S.orders.filter(o => o.week === ws).reduce((a, o) => a + (+o.amount || 0), 0), left = S.set.weekBudget - spent;
  return hdr() + `<h1 class="sr">Today at NY Grill &amp; Deli</h1>
  <button class="hero" id="bankbtn" aria-label="Update bank balance">
    <svg class="sky" viewBox="60 60 290 115" aria-hidden="true">${(LOGO.match(/<g class="lg-skyline"[\s\S]*?<\/g>\s*(?=<\/g>\s*<path class="lg-ground")/) || [''])[0].replace(/#1E1E20/g, '#fff').replace(/#FFFFFF"/g, '#1E1E20"')}</svg>
    <span class="tag ${ahead ? '' : 'bad'}">${ahead ? 'AHEAD' : 'BEHIND'}</span>
    <span class="lbl">Cash you really have</span>
    <div class="big ${ahead ? '' : 'neg'}"><span class="c">${ahead ? '$' : '-$'}</span>${fmt(Math.abs(avail))}</div>
    <span class="hint">${bank ? `Bank ${usd(bal)} on ${short(bank.date)}. Tap to update.` : 'Tap to enter your bank balance.'}</span>
    <div class="ledger" aria-hidden="true"><i style="width:${Math.max(0, avail) / tot * 100}%;background:#E39A33"></i><i style="width:${fl / tot * 100}%;background:#ffffffaa;animation-delay:.15s"></i><i style="width:${rent.owed / tot * 100}%;background:#ffffff55;animation-delay:.3s"></i></div>
    <div class="legend"><div><span class="dot" style="background:#E39A33"></span>Yours<b>${usd(avail)}</b></div><div><span class="dot" style="background:#ffffffaa"></span>Checks out<b>${usd(fl)}</b></div><div><span class="dot" style="background:#ffffff55"></span>Rent<b>${usd(rent.owed)}</b></div></div>
  </button>
  <div class="sec"><h2>${today === iso(new Date()) || new Date().getHours() < 6 ? 'Today' : nice(today)}</h2><span class="d" style="font-size:23px">${usd(nets.reduce((a, b) => a + b, 0) + dToday)}</span></div>
  <div class="list">${SHIFTS.map((s, i) => { const r = vals[i]; return `<a href="#entry/${s.k}" class="shift ${r ? 'done' : ''}"><div class="ic">${s.i}</div><div><b>${s.k}</b><small>${r ? `Card ${fmt(r.cc)}, cash ${fmt(r.cash)}, out ${fmt(r.out)}` : s.t}</small>${r ? `<div class="bar"><i style="width:${nets[i] / mx * 100}%"></i></div>` : ''}</div>${r ? `<div class="amt">${usd(nets[i])}</div>` : '<div class="amt empty">Add</div>'}</a>`; }).join('')}</div>
  <a href="#delivery" class="shift ${dToday ? 'done' : ''}" style="margin-top:8px"><div class="ic">DL</div><div><b>Delivery apps</b><small>${S.set.deliveryApps.map(a => `${esc(a)} ${usd(delivRec(today, a)?.amount || 0)}`).join(', ')}</small><small>This week ${usd(dWeek)}</small></div>${dToday ? `<div class="amt">${usd(dToday)}</div>` : '<div class="amt empty">Add</div>'}</a>
  <div class="grid2"><a href="#checks" class="mini"><span class="lbl">Checks not cleared</span><span class="v">${usd(fl)}</span><small>${openChecks().length} waiting</small></a>
  <button class="mini" id="rentbtn"><span class="lbl">Rent due ${short(rent.due)}</span><span class="v">${rent.days < 0 ? Math.abs(rent.days) : rent.days}<small style="font-size:15px;font-family:Geist"> ${rent.days < 0 ? 'days late' : rent.days === 1 ? 'day' : 'days'}</small></span><small>${rent.paid ? `${usd(S.set.rent)} held back` : `${usd(S.set.rent)}. Tap when paid`}</small></button></div>
  <div class="card" style="margin-top:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><div class="sub">Sales this week</div><div class="d" style="font-size:34px">${usd(tw)}</div></div>${pct === null ? '<span class="delta">No last week yet</span>' : `<span class="delta ${pct >= 0 ? 'up' : ''}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs last week</span>`}</div>
  <div class="week" role="img" aria-label="Daily sales this week compared to last week">${days.map((d, i) => `<div><i class="g" style="height:${d[1] / wm * 86}px"></i><i class="b ${i === dayIdx ? 'today' : ''}" style="height:${d[0] / wm * 86}px;animation-delay:${i * .05}s;--dl:${d[0] ? dlv[i] / d[0] * 100 : 0}%"></i><span>${'MTWTFSS'[i]}</span></div>`).join('')}</div>
  <p class="sub" style="font-size:13px;margin-top:8px">Bars are this week, dark top is delivery apps. Dashed is last week. Sales are card plus cash plus paid outs plus delivery.</p></div>
  <a href="#orders" class="card" style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px"><div><div class="sub">Order budget left this week</div><div class="d" style="font-size:34px;${left < 0 ? 'color:var(--bad)' : ''}">${usd(left)}</div><small class="sub" style="font-size:13px">${usd(spent)} ordered of ${usd(S.set.weekBudget)}</small></div><div class="ring" style="--p:${Math.min(100, spent / Math.max(1, S.set.weekBudget) * 100)}"><span>${Math.round(spent / Math.max(1, S.set.weekBudget) * 100)}%</span></div></a>
  ` + tabs('today');
};
V.today.wire = () => {
  $('#bankbtn').onclick = () => padSheet({ title: 'Bank balance', sub: `For ${nice(bizDate())}`, value: S.bank[0]?.balance, label: 'Balance', cta: 'Save balance', onSave: async n => { const d = bizDate(); await save('bank', { id: d, date: d, balance: n }, 'Bank'); stamp('SAVED'); go(); } });
  $('#rentbtn').onclick = async () => { const r = rentInfo(); S.set.rentPaidMonth = r.paid ? '' : monthKey(bizDate()); await save('settings', S.set); if (!r.paid) stamp('PAID'); go(); };
};

let E = null; // entry state
V.entry = (arg) => {
  if (!E || arg) { const date = E?.date || bizDate(), k = arg || curShift(); E = { date, k, f: 'cc' }; loadE(); }
  const t = (+E.cc || 0) + (+E.cash || 0) + (+E.out || 0), ex = shiftRec(E.date, E.k);
  const fld = (k, l, s) => `<button class="field" data-f="${k}" aria-pressed="${E.f === k}"><span class="k">${l}<small>${s}</small></span><span class="v ${E[k] ? '' : 'zero'}">$${typed(E[k])}</span></button>`;
  return `<h1 class="sr">Close a shift</h1><header class="top"><a class="icon" href="#today" aria-label="Close">✕</a><div style="display:flex;align-items:center;gap:4px"><button class="icon" data-day="-1" aria-label="Previous day">‹</button><b class="d" style="font-size:18px;min-width:118px;text-align:center">${E.date === bizDate() ? 'Today' : nice(E.date)}</b><button class="icon" data-day="1" aria-label="Next day" ${E.date >= bizDate() ? 'disabled style="opacity:.35"' : ''}>›</button></div></header>
  <div class="seg" role="group" aria-label="Shift">${SHIFTS.map(s => `<button data-s="${s.k}" aria-pressed="${E.k === s.k}">${s.k}${shiftRec(E.date, s.k) ? ' ✓' : ''}<small>${s.t}</small></button>`).join('')}</div>
  <div class="fields">${fld('cc', 'Card', 'Credit card batch')}${fld('cash', 'Cash', 'In the drawer')}${fld('out', 'Paid out', 'Taken from the drawer')}</div>
  <div class="total"><span>${E.k} total, card plus cash plus out</span><b>${usd(t)}</b></div>
  <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Delete' : k}">${k}</button>`).join('')}</div>
  <button class="save" id="save">${ex ? 'Update' : 'Save'} ${E.k.toLowerCase()} shift</button><a class="save ghost" href="#delivery" style="display:grid;place-items:center">Enter delivery app payouts</a>`;
};
function loadE() { const r = shiftRec(E.date, E.k); E.cc = r ? String(r.cc || '') : ''; E.cash = r ? String(r.cash || '') : ''; E.out = r ? String(r.out || '') : ''; E.f = 'cc'; }
V.entry.wire = () => {
  const re = () => render('entry');
  $$('[data-f]').forEach(b => b.onclick = () => { E.f = b.dataset.f; re(); });
  $$('[data-s]').forEach(b => b.onclick = () => { E.k = b.dataset.s; loadE(); re(); });
  $$('[data-day]').forEach(b => b.onclick = () => { if (b.disabled) return; E.date = addDays(E.date, +b.dataset.day); loadE(); re(); });
  const press = k => { let v = E[E.f]; if (k === '⌫') v = v.slice(0, -1); else if (k === '.') { if (!v.includes('.')) v = (v || '0') + '.'; } else if (!(v.includes('.') && v.split('.')[1].length >= 2) && v.length < 7) v = v === '0' ? k : v + k; E[E.f] = v; re(); };
  $$('.pad [data-k]').forEach(b => b.onclick = () => press(b.dataset.k));
  onkeydown = e => { if (location.hash.slice(1).split('/')[0] !== 'entry' || document.querySelector('.sheet')) return; if (/^[0-9.]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Tab') { e.preventDefault(); E.f = { cc: 'cash', cash: 'out', out: 'cc' }[E.f]; re(); } else if (e.key === 'Enter') $('#save').click(); };
  $('#save').onclick = async () => {
    const rec = { id: `${E.date}|${E.k}`, date: E.date, shift: E.k, cc: +E.cc || 0, cash: +E.cash || 0, out: +E.out || 0 }; rec.net = net(rec);
    await save('shifts', rec, 'Shifts'); stamp('SAVED'); const done = E.date; E = null; setTimeout(() => { location.hash = 'today'; }, 650);
  };
};
V.checks = () => {
  const op = openChecks().sort((a, b) => a.num - b.num), cl = S.checks.filter(c => c.cleared).sort((a, b) => (b.clearedAt || '').localeCompare(a.clearedAt || '')).slice(0, 15);
  const row = c => `<div class="row ${c.cleared ? 'done' : ''}"><button style="text-align:left" data-edit="${esc(c.id)}"><b>${esc(c.vendor)}</b><small>#${esc(c.num)}${c.date ? ', ' + short(c.date) : ''}</small></button><div class="amt">${usd(c.amount)}</div><button class="chk" role="checkbox" aria-checked="${!!c.cleared}" aria-label="Cleared: ${esc(c.vendor)} #${esc(c.num)}" data-n="${esc(c.id)}">✓</button></div>`;
  return hdr() + `<h1>Checks</h1><div class="sumrow"><div class="pill hot"><small>Still floating</small><b>${usd(floatAmt())}</b></div><div class="pill"><small>Not cleared</small><b>${op.length}</b></div></div>
  <button class="fab" id="add">+ Write a check</button>
  <div class="sec"><h2>Waiting to clear</h2></div><div class="list">${op.map(row).join('') || '<p class="sub">Every check has cleared.</p>'}</div>
  ${cl.length ? `<div class="sec"><h2>Recently cleared</h2></div><div class="list">${cl.map(row).join('')}</div>` : ''}<p class="note">Tap the box when a check clears the bank. Tap the name to fix it.</p>` + tabs('checks');
};
function checkSheet(c) {
  const isNew = !c; const nums = S.checks.map(x => parseInt(x.num) || 0);
  c = c || { num: nums.length ? String(Math.max(...nums) + 1) : '', vendor: '', amount: '', date: bizDate(), cleared: false };
  const top = [...new Set([...S.checks.map(x => x.vendor), ...S.set.vendors.map(v => v.name)])].slice(0, 10);
  padSheet({ title: isNew ? 'New check' : `Check #${c.num}`, value: c.amount, cta: isNew ? 'Add check' : 'Save check',
    extra: `<label class="l" for="cnum">Check number</label><input class="txt" id="cnum" inputmode="numeric" value="${esc(c.num)}"><label class="l" for="cven">Vendor</label><input class="txt" id="cven" autocomplete="off" value="${esc(c.vendor)}" placeholder="Vendor name…"><div class="chips">${top.map(v => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === c.vendor}">${esc(v)}</button>`).join('')}</div>`,
    wire: w => w.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { w.querySelector('#cven').value = b.dataset.v; w.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-pressed', x === b)); }),
    onSave: async (n, w) => {
      const num = w.querySelector('#cnum').value.trim(), vendor = w.querySelector('#cven').value.trim();
      if (!num || !vendor || !n) { toast('Add the check number, vendor and amount'); return false; }
      if (isNew && S.checks.some(x => x.num === num)) { toast(`Check #${num} is already in the list`); return false; }
      if (!isNew && c.id !== 'chk-' + num) await DB.del('checks', c.id, 'Checks');
      await save('checks', { ...c, id: 'chk-' + num, num, vendor, amount: n }, 'Checks'); stamp('SAVED'); go();
    },
    onDelete: isNew ? null : async () => { await DB.del('checks', c.id, 'Checks'); await load(); Sync.run(); go(); } });
}
V.checks.wire = () => {
  $('#add').onclick = () => checkSheet();
  $$('[data-edit]').forEach(b => b.onclick = () => checkSheet(S.checks.find(c => c.id === b.dataset.edit)));
  $$('.chk[data-n]').forEach(b => b.onclick = async () => { const c = S.checks.find(x => x.id === b.dataset.n); c.cleared = !c.cleared; c.clearedAt = c.cleared ? bizDate() : ''; b.setAttribute('aria-checked', c.cleared); if (c.cleared) stamp('CLEARED'); await save('checks', c, 'Checks'); setTimeout(go, 350); });
};
let D = null; // delivery entry state
V.delivery = (arg) => {
  const apps = S.set.deliveryApps;
  if (!D || arg) { D = { date: D?.date || bizDate(), a: arg ? decodeURIComponent(arg) : (D?.a || apps[0]) }; loadD(); }
  if (!apps.includes(D.a)) { D.a = apps[0]; loadD(); }
  const dayT = apps.reduce((t, a) => t + (a === D.a ? (+D.v || 0) : (+delivRec(D.date, a)?.amount || 0)), 0), ex = delivRec(D.date, D.a);
  return `<h1 class="sr">Delivery app payouts</h1><header class="top"><a class="icon" href="#today" aria-label="Close">✕</a><div style="display:flex;align-items:center;gap:4px"><button class="icon" data-day="-1" aria-label="Previous day">‹</button><b class="d" style="font-size:18px;min-width:118px;text-align:center">${D.date === bizDate() ? 'Today' : nice(D.date)}</b><button class="icon" data-day="1" aria-label="Next day" ${D.date >= bizDate() ? 'disabled style="opacity:.35"' : ''}>›</button></div></header>
  <div class="seg apps" role="group" aria-label="Delivery app" style="grid-template-columns:repeat(${Math.min(apps.length, 3)},1fr)">${apps.map(a => `<button data-a="${esc(a)}" aria-pressed="${D.a === a}">${esc(a)}${delivRec(D.date, a) ? ' ✓' : ''}<small>${delivRec(D.date, a) ? usd(delivRec(D.date, a).amount) : 'Not entered'}</small></button>`).join('')}</div>
  <div class="fields"><div class="field on"><span class="k">${esc(D.a)}<small>Payout for the day</small></span><span class="v ${D.v ? '' : 'zero'}">$${typed(D.v)}</span></div></div>
  <div class="total"><span>All delivery apps this day</span><b>${usd(dayT)}</b></div>
  <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Delete' : k}">${k}</button>`).join('')}</div>
  <button class="save" id="save">${ex ? 'Update' : 'Save'} ${esc(D.a)} payout</button>`;
};
function loadD() { const r = delivRec(D.date, D.a); D.v = r ? String(r.amount || '') : ''; }
V.delivery.wire = () => {
  const re = () => render('delivery');
  $$('[data-a]').forEach(b => b.onclick = () => { D.a = b.dataset.a; loadD(); re(); });
  $$('[data-day]').forEach(b => b.onclick = () => { if (b.disabled) return; D.date = addDays(D.date, +b.dataset.day); loadD(); re(); });
  const press = k => { let v = D.v; if (k === '⌫') v = v.slice(0, -1); else if (k === '.') { if (!v.includes('.')) v = (v || '0') + '.'; } else if (!(v.includes('.') && v.split('.')[1].length >= 2) && v.length < 7) v = v === '0' ? k : v + k; D.v = v; re(); };
  $$('.pad [data-k]').forEach(b => b.onclick = () => press(b.dataset.k));
  onkeydown = e => { if (location.hash.slice(1).split('/')[0] !== 'delivery' || document.querySelector('.sheet')) return; if (/^[0-9.]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Enter') $('#save').click(); };
  $('#save').onclick = async () => {
    await save('delivery', { id: `${D.date}|${D.a}`, date: D.date, app: D.a, amount: +D.v || 0 }, 'Delivery'); stamp('SAVED');
    const apps = S.set.deliveryApps, next = apps.find(a => !delivRec(D.date, a));
    if (next) { D.a = next; loadD(); setTimeout(re, 500); } else { D = null; setTimeout(() => { location.hash = 'today'; }, 650); }
  };
};
let PW = null;
V.payroll = () => {
  PW = PW || weekStart(bizDate());
  const rows = S.set.staff.map(s => { const r = S.payroll.find(p => p.id === `${PW}|${s.id}`) || { hours: 0, paid: false }; const pay = s.rate * (+r.hours || 0) + (s.manager && r.hours ? S.set.managerBonus : 0); return { s, r, pay }; });
  const tot = rows.reduce((a, x) => a + x.pay, 0), unpaid = rows.filter(x => !x.r.paid).reduce((a, x) => a + x.pay, 0);
  return hdr() + `<h1>Payroll</h1><div class="weeknav"><button class="icon" data-w="-7" aria-label="Previous week">‹</button><b>${short(PW)} to ${short(addDays(PW, 6))}</b><button class="icon" data-w="7" aria-label="Next week">›</button></div>
  <div class="sumrow"><div class="pill"><small>Week total</small><b>${usd(tot)}</b></div><div class="pill hot"><small>Still to pay</small><b>${usd(unpaid)}</b></div></div>
  <div class="sec"><h2>${rows.length} on staff</h2><a class="lnk" href="#settings">Edit staff</a></div>
  <div class="list">${rows.map(({ s, r, pay }) => `<div class="pay"><div class="av" aria-hidden="true">${esc(s.name[0])}</div><button class="hrs" data-h="${s.id}"><b style="font-size:17px">${esc(s.name)}${s.manager ? `<span class="mgr">+$${fmt(S.set.managerBonus)}</span>` : ''}</b><small>${r.hours ? `${r.hours}h at $${fmt(s.rate)}` : `<u>Add hours</u> at $${fmt(s.rate)}`}</small></button><div class="d" style="font-size:22px;text-align:right">${pay ? '$' + fmt(pay, pay % 1 !== 0) : ''}</div><button class="chk" role="checkbox" aria-checked="${!!r.paid}" aria-label="Paid: ${esc(s.name)}" data-p="${s.id}" ${pay ? '' : 'disabled style="opacity:.35"'}>✓</button></div>`).join('')}</div>
  <p class="note">Pay is rate times hours. The manager gets $${fmt(S.set.managerBonus)} on top.</p>` + tabs('payroll');
};
function payRec(sid) { const s = S.set.staff.find(x => x.id === sid); const r = S.payroll.find(p => p.id === `${PW}|${sid}`) || { id: `${PW}|${sid}`, week: PW, staffId: sid, hours: 0, paid: false }; return { s, r }; }
async function savePay(s, r) { r.name = s.name; r.role = s.role; r.rate = s.rate; r.bonus = s.manager && r.hours ? S.set.managerBonus : 0; r.pay = s.rate * (+r.hours || 0) + r.bonus; await save('payroll', r, 'Payroll'); }
V.payroll.wire = () => {
  $$('[data-w]').forEach(b => b.onclick = () => { PW = addDays(PW, +b.dataset.w); render('payroll'); });
  $$('[data-h]').forEach(b => b.onclick = () => { const { s, r } = payRec(b.dataset.h); padSheet({ title: s.name, sub: `Hours for ${short(PW)} to ${short(addDays(PW, 6))}`, label: 'Hours', money: false, value: r.hours || '', cta: 'Save hours', onSave: async n => { r.hours = n; await savePay(s, r); render('payroll'); } }); });
  $$('[data-p]').forEach(b => b.onclick = async () => { if (b.disabled) return; const { s, r } = payRec(b.dataset.p); r.paid = !r.paid; if (r.paid) stamp('PAID'); await savePay(s, r); setTimeout(() => render('payroll'), 300); });
};
let OW = null;
V.orders = () => {
  OW = OW || weekStart(bizDate());
  const wk = S.orders.filter(o => o.week === OW), amt = n => wk.find(o => o.vendor === n)?.amount || 0;
  const sp = c => S.set.vendors.filter(v => v.cat === c).reduce((a, v) => a + amt(v.name), 0);
  const tot = CATS.reduce((a, c) => a + sp(c), 0), left = S.set.weekBudget - tot;
  return hdr() + `<h1>Orders</h1><div class="weeknav"><button class="icon" data-w="-7" aria-label="Previous week">‹</button><b>${short(OW)} to ${short(addDays(OW, 6))}</b><button class="icon" data-w="7" aria-label="Next week">›</button></div>
  <div class="hero" style="margin-top:10px"><span class="lbl">Left to spend this week</span><div class="big ${left < 0 ? 'neg' : ''}" style="font-size:64px"><span class="c">${left < 0 ? '-$' : '$'}</span>${fmt(Math.abs(left))}</div>
  <div class="ledger" aria-hidden="true">${CATS.map((c, i) => `<i style="width:${sp(c) / Math.max(S.set.weekBudget, tot) * 100}%;background:${['#E39A33', '#ffffffcc', '#ffffff88', '#ffffff55'][i]};animation-delay:${i * .1}s"></i>`).join('')}</div><span class="hint">${usd(tot)} ordered of ${usd(S.set.weekBudget)}</span></div>
  <div class="list" style="margin-top:8px">${CATS.map(c => { const s = sp(c), b = S.set.cats[c]; return `<div class="cat"><div class="h"><b>${c}</b><span>${usd(s)} <small class="sub" style="font-family:Geist;font-size:14px">of ${fmt(b)}</small></span></div><div class="track"><i class="${s > b ? 'over' : ''}" style="width:${Math.min(100, s / Math.max(1, b) * 100)}%"></i></div>
   <div class="vend">${S.set.vendors.filter(v => v.cat === c).map(v => `<button data-v="${esc(v.name)}" class="${amt(v.name) ? 'has' : ''}">${esc(v.name)}${amt(v.name) ? ' ' + usd(amt(v.name)) : ''}</button>`).join('')}</div></div>`; }).join('')}</div>
  <p class="note">Tap a vendor to enter what you ordered from them this week.</p>` + tabs('orders');
};
V.orders.wire = () => {
  $$('[data-w]').forEach(b => b.onclick = () => { OW = addDays(OW, +b.dataset.w); render('orders'); });
  $$('[data-v]').forEach(b => b.onclick = () => { const v = S.set.vendors.find(x => x.name === b.dataset.v), id = `${OW}|${v.name}`, ex = S.orders.find(o => o.id === id);
    padSheet({ title: v.name, sub: `${v.cat}, week of ${short(OW)}`, value: ex?.amount || '', cta: 'Save order', onSave: async n => { await save('orders', { id, week: OW, vendor: v.name, category: v.cat, amount: n }, 'Orders'); render('orders'); } }); });
};
V.setup = () => `<h1 class="sr">Set up Deli Books</h1><div style="display:grid;justify-items:center;text-align:center;padding-top:28px">${logo()}</div>
  <h1 style="text-align:center;margin-top:18px">Set up your books</h1><p class="sub" style="text-align:center;margin:6px 12px 0">Everything stays on this phone. Nothing is filled in yet.</p>
  <div class="list" style="margin-top:22px"><button class="save" id="imp">Import my starting data</button><p class="sub" style="font-size:13px;text-align:center">Pick the starting data file you were sent (.json).</p>
  <button class="save ghost" id="hand">Set up by hand</button><p class="sub" style="font-size:13px;text-align:center">Then add your bank balance, rent, staff and vendors in Settings.</p></div>`;
V.setup.wire = () => {
  $('.lg').style.cssText = 'width:150px;height:150px;border-radius:50%;box-shadow:0 6px 24px #0003';
  $('#imp').onclick = pickImport;
  $('#hand').onclick = async () => { S.set.setupDone = true; await save('settings', S.set); location.hash = 'settings'; };
};
V.settings = () => {
  const st = S.set, debt = S.debts.reduce((a, d) => a + (+d.amount || 0), 0);
  return `<header class="top"><a class="icon" href="#today" aria-label="Back">‹</a><h1 class="d" style="font-size:20px;margin:0">Settings</h1><span style="width:48px"></span></header>
  <div class="sec"><h2>Money</h2></div><div class="set"><button class="it" id="bankset">Bank balance<b>${S.bank[0] ? usd(S.bank[0].balance) : 'Add'}</b></button></div>
  <div class="sec"><h2>Rent</h2></div><div class="set"><button class="it" data-num="rent">Monthly rent<b>${usd(st.rent)}</b></button><button class="it" data-num="rentDueDay">Due day<span>Day ${st.rentDueDay} of the month</span></button></div>
  <div class="sec"><h2>Order budget</h2></div><div class="set"><button class="it" data-num="weekBudget">Each week<b>${usd(st.weekBudget)}</b></button>${CATS.map(c => `<button class="it" data-cat="${c}">${c}<span>${usd(st.cats[c])}</span></button>`).join('')}</div>
  <div class="sec"><h2>Staff</h2><button class="lnk" id="addstaff">+ Add</button></div><div class="set">${st.staff.map(s => `<button class="it" data-staff="${s.id}">${esc(s.name)}${s.manager ? ' (manager)' : ''}<span>$${fmt(s.rate)} an hour</span></button>`).join('')}<button class="it" data-num="managerBonus">Manager weekly extra<span>${usd(st.managerBonus)}</span></button></div>
  <div class="sec"><h2>Vendors</h2><button class="lnk" id="addvend">+ Add</button></div><div class="set">${st.vendors.length ? st.vendors.map((v, i) => `<button class="it" data-vend="${i}">${esc(v.name)}<span>${esc(v.cat)}</span></button>`).join('') : '<div class="it"><span>No vendors yet</span></div>'}</div>
  <div class="sec"><h2>Delivery apps</h2><button class="lnk" id="addapp">+ Add</button></div><div class="set">${st.deliveryApps.map((a, i) => `<button class="it" data-app="${i}">${esc(a)}<span>Rename</span></button>`).join('')}</div>
  <div class="sec"><h2>Money owed</h2><button class="lnk" id="adddebt">+ Add</button></div><div class="set"><div class="it">Owed in total<b>${usd(debt)}</b></div>${S.debts.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map(d => `<button class="it" data-debt="${d.id}">${esc([d.who, d.note].filter(Boolean).join(', ') || 'Owed')}<span>${usd(d.amount)}</span></button>`).join('')}</div>
  <div class="sec"><h2>Google Sheets</h2></div><div class="set"><button class="it" id="syncset">Connection<span>${S.sync.url ? 'Connected' : 'Not set up'}</span></button><button class="it" id="syncnow">Send now<span id="syncstat">Checking</span></button></div>
  <div class="sec"><h2>App</h2></div><div class="set"><button class="it" id="theme">Look<span>${{ auto: 'Match phone', light: 'Light', dark: 'Dark' }[st.theme || 'auto']}</span></button><button class="it" id="chpin">Change PIN<span>${PIN ? 'On' : 'Off'}</span></button><button class="it" id="locknow">Lock now<span>Locks by itself after 2 minutes away</span></button><button class="it" id="backup">Download a backup<span>.json file</span></button><button class="it" id="impset">Import starting data<span>.json file</span></button><div class="it">Storage<span id="persist">Checking</span></div></div>
  <p class="note">Everything saves on this phone first, then copies to your Google Sheet when online.</p>`;
};
V.settings.wire = async () => {
  const st = S.set;
  const num = (title, key, money, setter, val) => padSheet({ title, money, value: val ?? st[key], label: money === false ? 'Number' : 'Amount', onSave: async n => { if (key === 'rentDueDay' && (n < 1 || n > 31)) { toast('Pick a day from 1 to 31'); return false; } setter ? setter(n) : st[key] = n; await save('settings', st); render('settings'); } });
  $$('[data-num]').forEach(b => b.onclick = () => { const k = b.dataset.num; num(b.childNodes[0].textContent, k, k === 'rentDueDay' ? false : undefined); });
  $$('[data-cat]').forEach(b => b.onclick = () => num(b.dataset.cat, null, undefined, n => st.cats[b.dataset.cat] = n, st.cats[b.dataset.cat]));
  const staffSheet = s => { const isNew = !s; s = s || { id: 's' + Date.now(), name: '', role: '', rate: '', manager: false };
    padSheet({ title: isNew ? 'New staff member' : s.name, label: 'Hourly rate', value: s.rate, cta: 'Save', extra: `<label class="l" for="sn">Name</label><input class="txt" id="sn" value="${esc(s.name)}"><label class="l" for="sr">Job</label><input class="txt" id="sr" value="${esc(s.role)}" placeholder="Register, Deli, Stock…"><label class="l" style="display:flex;align-items:center;gap:10px;min-height:48px"><input type="checkbox" id="sm" ${s.manager ? 'checked' : ''} style="width:24px;height:24px;accent-color:var(--acc)"> Manager (gets the weekly extra)</label>`,
      onSave: async (n, w) => { const name = w.querySelector('#sn').value.trim(); if (!name) { toast('Add a name'); return false; } Object.assign(s, { name, role: w.querySelector('#sr').value.trim(), rate: n, manager: w.querySelector('#sm').checked }); if (isNew) st.staff.push(s); await save('settings', st); render('settings'); },
      onDelete: isNew ? null : async () => { st.staff = st.staff.filter(x => x !== s); await save('settings', st); render('settings'); } }); };
  $('#addstaff').onclick = () => staffSheet();
  $$('[data-staff]').forEach(b => b.onclick = () => staffSheet(st.staff.find(s => s.id === b.dataset.staff)));
  const debtSheet = d => { const isNew = !d; d = d || { id: 'd' + Date.now(), who: '', note: '', amount: '', date: bizDate() };
    padSheet({ title: isNew ? 'Add money owed' : 'Edit amount', value: d.amount, extra: `<label class="l" for="dw">Who owes it</label><input class="txt" id="dw" value="${esc(d.who)}"><label class="l" for="dn">Note</label><input class="txt" id="dn" value="${esc(d.note)}">`, onSave: async (n, w) => { d.amount = n; d.who = w.querySelector('#dw').value.trim(); d.note = w.querySelector('#dn').value.trim(); await save('debts', d); render('settings'); }, onDelete: isNew ? null : async () => { await DB.del('debts', d.id); await load(); render('settings'); } }); };
  $('#adddebt').onclick = () => debtSheet();
  const appSheet = i => { const isNew = i === undefined; const w = document.createElement('div'); w.innerHTML = `<div class="scrim" data-x></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Delivery app"><div class="grab"></div><h3>${isNew ? 'New delivery app' : 'Rename app'}</h3><label class="l" for="an">App name</label><input class="txt" id="an" autocomplete="off" value="${isNew ? '' : esc(st.deliveryApps[i])}" placeholder="Postmates…"><button class="save" data-ok>Save app</button>${isNew ? '' : '<button class="save ghost" data-del>Remove from list</button>'}</div>`; document.body.append(w);
    w.querySelector('[data-x]').onclick = () => w.remove();
    w.querySelector('[data-ok]').onclick = async () => { const n = w.querySelector('#an').value.trim(); if (!n) { toast('Add the app name'); return; } if (st.deliveryApps.some((x, j) => x.toLowerCase() === n.toLowerCase() && j !== i)) { toast(`${n} is already in the list`); return; } if (isNew) st.deliveryApps.push(n); else st.deliveryApps[i] = n; await save('settings', st); w.remove(); render('settings'); };
    if (!isNew) w.querySelector('[data-del]').onclick = async () => { if (!confirm(`Remove ${st.deliveryApps[i]}? Payouts already saved stay in your books.`)) return; st.deliveryApps.splice(i, 1); await save('settings', st); w.remove(); render('settings'); }; };
  $('#addapp').onclick = () => appSheet();
  $('#impset').onclick = pickImport;
  $('#chpin').onclick = () => pinScreen(PIN ? 'change' : 'create', () => render('settings'));
  $('#locknow').onclick = lockNow;
  $('#bankset').onclick = () => padSheet({ title: 'Bank balance', sub: `For ${nice(bizDate())}`, value: S.bank[0]?.balance, label: 'Balance', cta: 'Save balance', onSave: async n => { const d = bizDate(); await save('bank', { id: d, date: d, balance: n }, 'Bank'); render('settings'); } });
  const vendSheet = i => { const isNew = i === undefined, v = isNew ? { name: '', cat: CATS[0] } : st.vendors[i]; let cat = v.cat; const w = document.createElement('div'); w.innerHTML = `<div class="scrim" data-x></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Vendor"><div class="grab"></div><h3>${isNew ? 'New vendor' : 'Edit vendor'}</h3><label class="l" for="vn">Vendor name</label><input class="txt" id="vn" autocomplete="off" value="${esc(v.name)}" placeholder="Vendor name…"><p class="l">Budget group</p><div class="chips">${CATS.map(c => `<button type="button" data-c="${c}" aria-pressed="${c === cat}">${c}</button>`).join('')}</div><button class="save" data-ok>Save vendor</button>${isNew ? '' : '<button class="save ghost" data-del>Remove vendor</button>'}</div>`; document.body.append(w);
    w.querySelector('[data-x]').onclick = () => w.remove();
    w.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; w.querySelectorAll('[data-c]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    w.querySelector('[data-ok]').onclick = async () => { const n = w.querySelector('#vn').value.trim(); if (!n) { toast('Add the vendor name'); return; } if (isNew) st.vendors.push({ name: n, cat }); else Object.assign(v, { name: n, cat }); await save('settings', st); w.remove(); render('settings'); };
    if (!isNew) w.querySelector('[data-del]').onclick = async () => { if (!confirm(`Remove ${v.name}?`)) return; st.vendors.splice(i, 1); await save('settings', st); w.remove(); render('settings'); }; };
  $('#addvend').onclick = () => vendSheet();
  $$('[data-vend]').forEach(b => b.onclick = () => vendSheet(+b.dataset.vend));
  $$('[data-app]').forEach(b => b.onclick = () => appSheet(+b.dataset.app));
  $$('[data-debt]').forEach(b => b.onclick = () => debtSheet(S.debts.find(d => d.id === b.dataset.debt)));
  $('#theme').onclick = async () => { st.theme = { auto: 'light', light: 'dark', dark: 'auto' }[st.theme || 'auto']; await save('settings', st); render('settings'); };
  $('#syncset').onclick = () => { const w = document.createElement('div'); w.innerHTML = `<div class="scrim" data-x></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Google Sheets connection"><div class="grab"></div><h3>Google Sheets</h3><p class="sub">Paste the web app link and the secret word from the setup steps.</p><label class="l" for="su">Web app link</label><input class="txt" id="su" type="url" inputmode="url" autocomplete="off" spellcheck="false" value="${esc(S.sync.url)}" placeholder="https://script.google.com/macros/s/…/exec"><label class="l" for="ss">Secret word</label><input class="txt" id="ss" autocomplete="off" spellcheck="false" value="${esc(S.sync.secret)}"><button class="save" data-ok>Save and send</button></div>`; document.body.append(w);
    w.querySelector('[data-x]').onclick = () => w.remove();
    w.querySelector('[data-ok]').onclick = async () => { const url = w.querySelector('#su').value.trim(); if (url && !/^https:\/\/script\.google\.com\//.test(url)) { toast('The link should start with https://script.google.com/'); return; } S.sync = { id: 'sync', url, secret: w.querySelector('#ss').value.trim() }; await DB.put('settings', S.sync); w.remove(); await queueAll(); Sync.run(); render('settings'); }; };
  $('#syncnow').onclick = () => { Sync.run(); toast('Sending…'); };
  $('#backup').onclick = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...S, sync: { url: S.sync.url } }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `deli-books-${bizDate()}.json`; a.click(); };
  const p = await navigator.storage?.persisted?.(); $('#persist').textContent = p ? 'Kept safe (persistent)' : 'Normal. Add to Home Screen to keep it safe';
  const s = await Sync.status(); $('#syncstat').textContent = !S.sync.url ? 'Off' : s.pending ? `${s.pending} waiting` : 'All sent';
};
// When Sheets is first connected, queue everything already on the phone so the sheet starts complete.
async function queueAll() {
  const q = await DB.all('outbox'); if (q.length) return;
  for (const [st, tab] of [['delivery', 'Delivery'], ['shifts', 'Shifts'], ['checks', 'Checks'], ['bank', 'Bank'], ['payroll', 'Payroll'], ['orders', 'Orders']]) for (const r of await DB.all(st)) await DB.put(st, r, tab);
  await load();
}

/* ---------- router ---------- */
function render(name, arg) { const v = V[name] || V.today; app.innerHTML = `<main class="scr">${v(arg)}</main>`; v.wire?.(); paintSync(); }
function go() { document.querySelectorAll('.sheet,.scrim').forEach(n => (n.closest('body > div:not(#app):not(#splash)') || n).remove()); const [h, a] = (location.hash.slice(1) || 'today').split('/'); if (h !== 'entry') E = null; if (h !== 'delivery') D = null; const name = !S.set.setupDone && h !== 'settings' ? 'setup' : V[h] ? h : 'today'; render(name, a); if (S.set.setupDone && !PIN && !document.getElementById('lock')) pinScreen('create'); scrollTo(0, 0); }
async function paintSync(s) { const el = $('#syncline'); if (!el) return; s = s || await Sync.status(); const on = !!S.sync.url;
  el.className = 'sync ' + (!on ? '' : s.pending ? 'wait' : 'ok'); el.lastChild.textContent = !on ? 'Saved on this phone' : s.pending ? `Saved. ${s.pending} to send to Sheets` : 'Saved and in Google Sheets'; }

/* ---------- PIN lock (blocks casual access; it is not encryption) ---------- */
const b64 = u8 => btoa(String.fromCharCode(...u8)), unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
const PIN_ITER = 150000;
async function pinHash(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITER }, key, 256)));
}
async function setPin(pin) { const salt = crypto.getRandomValues(new Uint8Array(16)); await DB.put('settings', { id: 'pin', salt: b64(salt), hash: await pinHash(pin, salt), iter: PIN_ITER }); PIN = await DB.get('settings', 'pin'); }
async function checkPin(pin) { if (!PIN) return true; const h = await pinHash(pin, unb64(PIN.salt)); let d = h.length ^ PIN.hash.length; for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ PIN.hash.charCodeAt(i); return d === 0; }
let PIN = null, locked = false, hiddenAt = 0, tries = 0;
// mode: 'unlock' | 'create' | 'change'
function pinScreen(mode, done) {
  document.getElementById('lock')?.remove();
  const el = document.createElement('div'); el.id = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  app.setAttribute('aria-hidden', 'true'); app.style.visibility = 'hidden';
  let step = mode === 'unlock' ? 'unlock' : mode === 'change' ? 'old' : 'new', v = '', first = '';
  const title = () => ({ unlock: 'Enter your PIN', old: 'Enter your current PIN', new: mode === 'create' ? 'Create a PIN' : 'Choose a new PIN', again: 'Type the PIN again' }[step]);
  const hint = () => ({ unlock: 'Deli Books is locked', old: 'To change your PIN', new: '4 to 6 numbers. You will type it each time you open the app.', again: 'To make sure it is right' }[step]);
  el.innerHTML = `<div class="lockin"><div class="lg">${LOGO}</div><h1 class="d" id="lt"></h1><p class="sub" id="lh" aria-live="polite"></p><div class="dots" id="ld" aria-hidden="true"></div>
    <div class="pad pinpad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(k => `<button type="button" data-pk="${k}" aria-label="${k === '⌫' ? 'Delete' : k === 'OK' ? 'Done' : k}" class="${k === 'OK' ? 'okk' : ''}">${k}</button>`).join('')}</div>
    ${mode === 'unlock' ? '<button class="lnk" id="forgot" type="button">Forgot PIN</button>' : mode === 'change' ? '<button class="lnk" id="pincancel" type="button">Cancel</button>' : ''}</div>`;
  document.body.append(el);
  const paint = (msg) => { el.querySelector('#lt').textContent = title(); el.querySelector('#lh').textContent = msg || hint(); el.querySelector('#ld').innerHTML = [...Array(Math.max(4, v.length))].map((_, i) => `<i class="${i < v.length ? 'on' : ''}"></i>`).join(''); };
  const shake = msg => { v = ''; paint(msg); el.querySelector('#ld').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-12px)' }, { transform: 'translateX(12px)' }, { transform: 'translateX(0)' }], { duration: 300 }); navigator.vibrate?.([30, 40, 30]); };
  const finish = () => { el.remove(); app.removeAttribute('aria-hidden'); app.style.visibility = ''; removeEventListener('keydown', kd); done?.(); };
  const submit = async () => {
    if (v.length < 4) return shake('Use at least 4 numbers');
    if (step === 'unlock' || step === 'old') {
      if (await checkPin(v)) { tries = 0; if (step === 'unlock') { locked = false; return finish(); } step = 'new'; v = ''; return paint(); }
      tries++; await new Promise(r => setTimeout(r, Math.min(8000, 400 * 2 ** Math.max(0, tries - 3))));
      return shake(`Wrong PIN. Try again.${tries >= 3 ? ` (${tries} tries)` : ''}`);
    }
    if (step === 'new') { first = v; v = ''; step = 'again'; return paint(); }
    if (step === 'again') { if (v !== first) { step = 'new'; return shake('The two PINs did not match. Start again.'); } await setPin(v); locked = false; stamp('PIN SET'); return finish(); }
  };
  const press = k => { if (k === '⌫') v = v.slice(0, -1); else if (k === 'OK') return submit(); else if (v.length < 6) v += k; paint(); };
  const kd = e => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Enter') press('OK'); };
  addEventListener('keydown', kd);
  el.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => press(b.dataset.pk));
  el.querySelector('#pincancel')?.addEventListener('click', finish);
  el.querySelector('#forgot')?.addEventListener('click', async () => {
    const synced = !!S.sync?.url;
    const ok1 = confirm(`Forgot your PIN? The only way in is to ERASE everything stored in Deli Books on this phone.\n\n${synced ? 'Your Google Sheet keeps a copy of what was already sent, but anything still waiting to send will be lost.' : 'Google Sheets is not connected, so this data exists nowhere else and will be gone for good.'}`);
    if (!ok1) return;
    if ((prompt('Type ERASE to delete all Deli Books data on this phone') || '').trim() !== 'ERASE') return toast('Nothing was erased');
    await new Promise(r => { const d = indexedDB.deleteDatabase('ny-deli-books'); d.onsuccess = d.onerror = d.onblocked = r; setTimeout(r, 1500); });
    location.replace(location.pathname);
  });
  paint();
}
function lockNow() { if (!PIN || document.getElementById('lock')) return; locked = true; pinScreen('unlock'); }
document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else if (PIN && hiddenAt && Date.now() - hiddenAt > 120000) lockNow(); });
Sync.on(paintSync);
addEventListener('hashchange', go);

(async function start() {
  const splash = $('#splash'), t0 = Date.now();
  try { LOGO = await (await fetch('logo.svg')).text(); LOGO = LOGO.replace(/<\?xml[^>]*>/, '').replace(/<title>.*?<\/title>/, ''); } catch { }
  splash.querySelector('.lg').innerHTML = LOGO;
  if (navigator.storage?.persist) { try { await navigator.storage.persist(); } catch { } }
  await DB.open(); await seed(); await load(); PIN = await DB.get('settings', 'pin');
  if (PIN) lockNow();
  go(); Sync.run();
  setTimeout(() => splash.classList.add('out'), Math.max(0, 1100 - (Date.now() - t0)));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
})();
