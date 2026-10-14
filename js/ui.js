/* Shell: icons, navigation, header, banners, router. */
const NAV = [['home', 'Home', 'home'], ['days', 'Days', 'days'], ['entry', 'Close out', 'plus'], ['money', 'Money', 'money'], ['insights', 'Insights', 'insights']];
function nav(cur) {
  const item = ([h, l, i]) => `<a href="#${h}" class="${h === 'entry' ? 'plus' : ''}" ${h === 'entry' ? 'aria-label="Close out a shift"' : ''} ${cur === h ? 'aria-current="page"' : ''}><span class="ni">${ICON[i]}</span><span class="nl">${l}</span></a>`;
  return `<nav class="tabs" aria-label="Main">${NAV.map(item).join('')}</nav>
  <nav class="side" aria-label="Sidebar"><a href="#entry" class="cta">${ICON.plus}<span>Close out a shift</span><kbd>N</kbd></a>
   ${NAV.filter(n => n[0] !== 'entry').map(item).join('')}<div class="sideh">Books</div>${[['report', 'Monthly report', 'report'], ['money/payroll', 'Payroll', 'users'], ['money/owed', 'Owed to you', 'receipt']].map(item).join('')}
   <div class="sidefoot">${item(['settings', 'Settings', 'gear'])}<small id="syncside" class="sync"><i></i><span>Saved on this device</span></small></div></nav>`;
}
const JUMP = [['Home', 'home'], ['Days', 'days'], ['Close out a shift', 'entry'], ['Delivery payouts', 'delivery'], ['Checks', 'money/checks'], ['Payroll', 'money/payroll'], ['Owed to you', 'money/owed'], ['Insights', 'insights'], ['Monthly report', 'report'], ['Settings', 'settings']];
const topbar = () => `<header class="topbar"><a class="store" href="#home">${logo()}<span><b translate="no">NY Grill &amp; Deli</b><small id="syncline" class="sync"><i></i><span>Saved on this device</span></small></span></a>
  <label class="search">${ICON.search}<span class="sr">Search or jump to</span><input id="jump" type="search" list="jumps" placeholder="Search or jump to…" autocomplete="off"><kbd>/</kbd></label><datalist id="jumps">${JUMP.map(j => `<option value="${j[0]}">`).join('')}</datalist>
  <span class="tbr"><a class="icon" href="#home" aria-label="Reminders">${ICON.bell}${dueShifts().length || (S.set?.setupDone && reminders().length) ? '<i class="badge"></i>' : ''}</a><a class="icon" href="#settings" aria-label="Settings">${ICON.gear}</a><span class="avatar" aria-hidden="true">O</span></span></header>`;
const hdr = () => '';
const ptitle = (t, sub, act = '') => `<div class="ph"><div><h1>${t}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${act}</div>`;
const subhdr = (title, back = '#home', right = '') => `<div class="ph sub"><a class="icon" href="${back}" aria-label="Back">${ICON.back}</a><h1 class="t">${title}</h1>${right || '<span class="sp"></span>'}</div>`;
const shell = (cur, body) => `${topbar()}<div class="layout">${nav(cur)}<main class="scr" id="main" tabindex="-1">${body}</main></div>`;
function wireJump() {
  const j = $('#jump'); if (!j) return;
  const goJ = () => { const v = j.value.trim().toLowerCase(); if (!v) return; const hit = JUMP.find(x => x[0].toLowerCase() === v) || JUMP.find(x => x[0].toLowerCase().includes(v)); const ck = S.checks.find(c => c.num === v.replace('#', '') || c.vendor.toLowerCase().includes(v)); if (hit) location.hash = hit[1]; else if (ck) location.hash = 'money/checks'; else toast('Nothing found for ' + j.value); j.value = ''; };
  j.addEventListener('change', goJ); j.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goJ(); } });
}
addEventListener('keydown', e => { if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !Keys.depth() && !document.getElementById('lock') && $('#jump')?.offsetParent) { e.preventDefault(); $('#jump').focus(); } });

/* Close-out banner: any shift whose end time has passed in the last 30 hours and has no entry. */
function dueShifts(now = new Date()) {
  const out = [], today = bizDate(now);
  for (const d of [addDays(today, -1), today]) for (const s of SHIFTS) { const e = shiftEnd(d, s.k); if (e <= now && now - e < 30 * 36e5 && !shiftRec(d, s.k)) out.push({ date: d, k: s.k, end: e }); }
  return out;
}
function banners() {
  const due = dueShifts(); if (!due.length) return '';
  const d = due[due.length - 1];
  return `<a class="banner" href="#entry/${d.k}/${d.date}" data-due="${d.date}|${d.k}"><span class="bi">${ICON.bell}</span><span><b>${d.k} close-out is due</b><small>${d.date === bizDate() ? 'Today' : nice(d.date)}, ended ${fmtT(SHIFTS.find(s => s.k === d.k).end)}${due.length > 1 ? `. ${due.length - 1} more not entered` : ''}</small></span><span class="go">Enter</span></a>`;
}

/* Router */
let ROUTE = 'home';
function render(name, args = []) {
  const v = V[name] || V.home; ROUTE = name;
  Keys.clearScreen();
  const body = v(...args);
  app.innerHTML = v.bare ? `<main class="scr bare" id="main" tabindex="-1">${body}</main>` : shell(v.nav || name, body);
  v.wire?.(...args); paintSync(); wireJump();
  requestAnimationFrame(() => app.querySelectorAll('[data-grow]').forEach(el => el.classList.add('in')));
}
function go() {
  document.querySelectorAll('.sheetwrap').forEach(n => { n.remove(); });
  while (Keys.depth()) Keys.pop(Keys.top());
  const [h, ...a] = (location.hash.slice(1) || 'home').split('/');
  const name = !S.set.setupDone && h !== 'settings' ? 'setup' : V[h] ? h : 'home';
  render(name, a.map(decodeURIComponent));
  if (S.set.setupDone && !PIN && !document.getElementById('lock')) pinScreen('create');
  scrollTo(0, 0);
  document.title = (name === 'home' ? '' : (V[name]?.title || name[0].toUpperCase() + name.slice(1)) + ', ') + 'NY Grill & Deli Books';
}
async function paintSync(s) {
  const els = $$('#syncline, #syncside'); if (!els.length) return; s = s || await Sync.status(); const on = !!S.sync?.url;
  for (const el of els) { el.className = 'sync ' + (!on ? '' : s.pending ? 'wait' : 'ok'); el.querySelector('span').textContent = !on ? 'Saved on this device' : s.pending ? `Saved. ${s.pending} to send to Sheets` : 'Saved and in Google Sheets'; }
}
// Desktop shortcuts: N opens close-out, G then a letter jumps. Ignored while typing or when a sheet/lock is open.
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || Keys.depth() || document.getElementById('lock') || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || ROUTE === 'entry' || ROUTE === 'delivery') return;
  const m = { n: 'entry', h: 'home', d: 'days', m: 'money', i: 'insights', r: 'report' }[e.key.toLowerCase()];
  if (m && !Keys.top()) { e.preventDefault(); location.hash = m; }
});
