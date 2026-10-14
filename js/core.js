/* NY Grill & Deli Books v2. Core helpers, state and money math. Single user, offline first. */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, cents) => (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
const usd = n => (n < 0 ? '-$' : '$') + fmt(Math.abs(n), Math.round(Math.abs(n) * 100) % 100 !== 0);
const usd0 = n => (n < 0 ? '-$' : '$') + fmt(Math.abs(Math.round(n)));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nice = s => { const d = parse(s); return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
const short = s => { const d = parse(s); return `${MON[d.getMonth()]} ${d.getDate()}`; };
const monthName = m => { const d = parse(m + '-01'); return `${MONL[d.getMonth()]} ${d.getFullYear()}`; };
const pct = (a, b) => b ? (a / b - 1) * 100 : null;
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const avg = arr => arr.length ? sum(arr) / arr.length : 0;

/* Shifts. The store runs 24/7: before 6 AM still belongs to yesterday's overnight shift. */
// Shift times are editable (Settings > Shift times). Stored as start times; each shift ends when the next starts.
const DEF_TIMES = { Morning: '06:00', Evening: '14:00', Overnight: '19:00' };
const SHIFTS = [{ k: 'Morning' }, { k: 'Evening' }, { k: 'Overnight' }];
const tmin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const tstr = n => `${String(Math.floor(((n % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((n % 60) + 60) % 60).padStart(2, '0')}`;
const fmtT = t => { const n = tmin(t), h = Math.floor(n / 60) % 24, m = n % 60; return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
const shiftTimes = () => { let t = null; try { t = S.set?.shiftTimes; } catch { t = null; } return { ...DEF_TIMES, ...(t || {}) }; };
// Start/end for every shift; ends are the next shift's start (Overnight ends at Morning start next day).
function shiftWin(times = shiftTimes()) { return SHIFTS.map((s, i) => ({ k: s.k, start: times[s.k], end: times[SHIFTS[(i + 1) % 3].k] })); }
function refreshShifts() { for (const w of shiftWin()) Object.assign(SHIFTS.find(s => s.k === w.k), { start: w.start, end: w.end, t: `${fmtT(w.start)} to ${fmtT(w.end)}` }); }
refreshShifts();
// Rules: Morning starts before Evening, Evening before Overnight, all on the same calendar day; Overnight crosses midnight to Morning.
function checkTimes(win) {
  const g = k => win.find(w => w.k === k), M = g('Morning'), E = g('Evening'), O = g('Overnight');
  if ([M, E, O].some(w => !/^\d\d:\d\d$/.test(w.start || '') || !/^\d\d:\d\d$/.test(w.end || ''))) return 'Every shift needs a start and an end.';
  if (M.end !== E.start) return `Morning ends at ${fmtT(M.end)} but Evening starts at ${fmtT(E.start)}. They must match, with no gap or overlap.`;
  if (E.end !== O.start) return `Evening ends at ${fmtT(E.end)} but Overnight starts at ${fmtT(O.start)}. They must match.`;
  if (O.end !== M.start) return `Overnight ends at ${fmtT(O.end)} but Morning starts at ${fmtT(M.start)}. They must match.`;
  if (!(tmin(M.start) < tmin(E.start) && tmin(E.start) < tmin(O.start))) return 'Morning must start before Evening, and Evening before Overnight, on the same day.';
  if (tmin(O.end) >= tmin(O.start)) return 'Overnight must run past midnight.';
  return '';
}
const dayMin = d => d.getHours() * 60 + d.getMinutes();
function bizDate(now = new Date()) { const d = new Date(now); if (dayMin(d) < tmin(shiftTimes().Morning)) d.setDate(d.getDate() - 1); return iso(d); }
function curShift(now = new Date()) { const t = shiftTimes(), m = dayMin(now); return m >= tmin(t.Morning) && m < tmin(t.Evening) ? 'Morning' : m >= tmin(t.Evening) && m < tmin(t.Overnight) ? 'Evening' : 'Overnight'; }
// Actual window for one shift on one business day. A saved record can carry its own start/end for that day only.
function shiftSpan(date, k, rec = shiftRec?.(date, k)) {
  const s = SHIFTS.find(x => x.k === k), st = rec?.start || s.start, en = rec?.end || s.end, ms = tmin(shiftTimes().Morning);
  const at = (t, after) => { const d = parse(date), n = tmin(t); if (n < ms) d.setDate(d.getDate() + 1); d.setHours(Math.floor(n / 60), n % 60, 0, 0); if (after && d <= after) d.setDate(d.getDate() + 1); return d; };
  const a = at(st); return { start: a, end: at(en, a), startT: st, endT: en };
}
function shiftEnd(date, k) { return shiftSpan(date, k).end; }
const weekStart = s => { const d = parse(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
const typed = v => { if (!v) return '0'; const [a, b] = v.split('.'); return (+a).toLocaleString('en-US') + (b !== undefined ? '.' + b : ''); };
// Shift total: card + cash + paid out. Paid outs were spent from the drawer, so they are added back as money made.
const net = r => (+r.cc || 0) + (+r.cash || 0) + (+r.out || 0);

/* First run. Public build: no business data ships in the code. */
const SEED = { id: 'main', setupDone: false, rent: 0, rentDueDay: 1, rentPaidMonth: '', deliveryApps: ['Grubhub', 'Uber Eats', 'DoorDash'], managerBonus: 0, payday: 5, cushion: 3000, theme: 'auto', staff: [], vendors: [], notify: false };
async function seed() { if (!(await DB.get('settings', 'main'))) await DB.put('settings', structuredClone(SEED)); }
// Starting data file: { format: "deli-books-seed-1", settings, checks, bank, debts, shifts, payroll, delivery }
async function importData(o) {
  if (!o || o.format !== 'deli-books-seed-1' || !o.settings) throw new Error('This file is not a Deli Books starting data file');
  const set = { ...structuredClone(SEED), ...o.settings, id: 'main', setupDone: true };
  delete set.weekBudget; delete set.cats;
  await DB.put('settings', set);
  for (const [k, tab] of [['checks', 'Checks'], ['bank', 'Bank'], ['shifts', 'Shifts'], ['payroll', 'Payroll'], ['delivery', 'Delivery'], ['debts', null]])
    await DB.putMany(k, (o[k] || []).filter(r => r && r.id), tab);
  await load(); Sync.run();
}
function pickImport() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.id = 'importfile'; inp.hidden = true; document.body.append(inp);
  inp.onchange = async () => { try { await importData(JSON.parse(await inp.files[0].text())); stamp('Loaded'); location.hash = 'home'; go(); } catch (e) { toast(String(e.message || e)); } inp.remove(); };
  inp.click();
}

/* State */
let S = {};
async function load() {
  const [settings, shifts, checks, bank, payroll, debts, delivery] = await Promise.all(['settings', 'shifts', 'checks', 'bank', 'payroll', 'debts', 'delivery'].map(DB.all));
  S = { set: settings.find(x => x.id === 'main'), sync: settings.find(x => x.id === 'sync') || { id: 'sync', url: '', secret: '' }, shifts, checks, bank: bank.sort((a, b) => a.date < b.date ? 1 : -1), payroll, debts, delivery };
  const st = S.set; let fix = false;
  if (st && !st.deliveryApps) { st.deliveryApps = ['Grubhub', 'Uber Eats', 'DoorDash']; fix = true; }
  if (st && st.payday === undefined) { st.payday = 5; fix = true; }
  if (st && st.cushion === undefined) { st.cushion = 3000; fix = true; }
  if (st && ('weekBudget' in st || 'cats' in st)) { delete st.weekBudget; delete st.cats; fix = true; }
  if (st && !st.skin) { st.skin = 'brass'; if (!st.theme || st.theme === 'auto') st.theme = 'light'; fix = true; }
  if (fix) await DB.put('settings', st);
  refreshShifts(); applyTheme();
}
const SKINS = [['ledger', 'Midnight Ledger', 'Navy, amber and emerald', ['#0B1630', '#F2B33D', '#34D399']], ['brass', 'Brass & Bone', 'Ivory, ink and brass', ['#F4EFE4', '#1D1A16', '#C9A253']], ['neon', 'Neon Deli', 'Charcoal, orange and teal', ['#141414', '#FF7A1A', '#2DE2E6']]];
const SKIN_MODE = { ledger: 'dark', brass: 'light', neon: 'dark' };
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
// Skin sets fonts and colors; mode is resolved to light or dark so each skin can carry both.
function applyTheme() {
  const t = S.set?.theme || 'auto', el = document.documentElement;
  el.dataset.skin = S.set?.skin || 'brass';
  el.dataset.theme = t === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : t;
}
darkMQ.addEventListener?.('change', () => applyTheme());

/* Money math */
const monthKey = s => s.slice(0, 7);
const openChecks = () => S.checks.filter(c => !c.cleared);
const floatAmt = () => sum(openChecks(), c => c.amount);
function rentInfo(today = bizDate()) {
  const set = S.set, paid = set.rentPaidMonth === monthKey(today), d = parse(today);
  const dueIn = m => { const x = new Date(d.getFullYear(), d.getMonth() + m, 1); x.setDate(Math.min(set.rentDueDay || 1, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return iso(x); };
  const thisDue = dueIn(0), due = paid ? dueIn(1) : thisDue;
  return { rent: +set.rent || 0, owed: paid ? 0 : (+set.rent || 0), paid, due, days: daysBetween(today, due), late: !paid && today > thisDue };
}
const shiftRec = (date, k) => S.shifts.find(r => r.id === `${date}|${k}`);
const storeDay = date => sum(S.shifts.filter(r => r.date === date), net);
const delivDay = date => sum(S.delivery.filter(r => r.date === date), r => r.amount);
const dayTotal = date => storeDay(date) + delivDay(date);
const delivRec = (date, a) => S.delivery.find(r => r.id === `${date}|${a}`);
const hasDay = date => S.shifts.some(r => r.date === date) || S.delivery.some(r => r.date === date);
// Saved rows win (history keeps the rate, pay and people of that week); current staff fill in the rest.
function payRows(week) {
  const saved = S.payroll.filter(p => p.week === week), out = [];
  for (const s of S.set.staff) { const r = saved.find(p => p.staffId === s.id) || { hours: 0, paid: false }; const pay = r.pay !== undefined && r.hours ? +r.pay : s.rate * (+r.hours || 0) + (s.manager && r.hours ? +S.set.managerBonus || 0 : 0); out.push({ s, r, pay }); }
  for (const r of saved) if (!S.set.staff.some(s => s.id === r.staffId)) out.push({ s: { id: r.staffId, name: r.name || 'Former staff', role: r.role || '', rate: +r.rate || 0, manager: false, gone: true }, r, pay: +r.pay || 0 });
  return out;
}
const payUnpaid = week => sum(payRows(week).filter(x => !x.r.paid), x => x.pay);
// Payroll recorded for a week from saved rows (keeps history right even if staff change later).
const payWeekTotal = week => sum(S.payroll.filter(p => p.week === week), p => p.pay ?? ((+p.rate || 0) * (+p.hours || 0) + (+p.bonus || 0)));

/* The hero number: bank, minus checks still out, minus rent if unpaid, minus payroll still owed this week. */
function okay() {
  const today = bizDate(), bank = S.bank[0], bal = bank ? +bank.balance : 0, fl = floatAmt(), r = rentInfo(today), pw = payUnpaid(weekStart(today));
  const v = bal - fl - r.owed - pw, cushion = +S.set.cushion || 0;
  const status = v < 0 ? 'bad' : v < cushion ? 'warn' : 'good';
  let line;
  if (!bank) line = 'Add your bank balance to see where you stand.';
  else if (status === 'bad') line = `You are ${usd0(-v)} short once checks, rent and payroll come out.`;
  else if (status === 'warn') line = `Covered, but only ${usd0(v)} left. That is under your ${usd0(cushion)} cushion.`;
  else line = `Everything owed is covered, with ${usd0(v - cushion)} above your cushion.`;
  const stale = bank ? daysBetween(bank.date, today) : 0;
  return { v, bal, fl, rent: r, pw, status, line, bank, stale };
}

/* UI helpers */
let LOGO = '';
const logo = cls => `<div class="lg ${cls || ''}" aria-hidden="true">${LOGO}</div>`;
function stamp(t) { const s = document.createElement('div'); s.className = 'stamp'; s.textContent = t; s.setAttribute('role', 'status'); document.body.append(s); setTimeout(() => s.remove(), 1100); navigator.vibrate?.(12); }
function toast(t) { const s = document.createElement('div'); s.className = 'toast'; s.setAttribute('role', 'status'); s.textContent = t; document.body.append(s); setTimeout(() => s.remove(), 2600); }
async function save(store, rec, tab) { await DB.put(store, rec, tab); await load(); Sync.run(); }
const V = {};
