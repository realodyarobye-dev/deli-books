/* Setup and Settings. */
V.setup = () => `<div class="setup">${logo('xl')}<h1>Set up your books</h1><p class="sub">Everything stays on this device. Nothing is filled in yet.</p>
  <button class="save" id="imp" type="button">Import my starting data</button><p class="sub sm">Pick the starting data file you were sent (.json).</p>
  <button class="save ghost" id="hand" type="button">Set up by hand</button><p class="sub sm">Then add your bank balance, rent and staff in Settings.</p></div>`;
V.setup.bare = true;
V.setup.wire = () => { $('#imp').onclick = pickImport; $('#hand').onclick = async () => { S.set.setupDone = true; await save('settings', S.set); location.hash = 'settings'; }; };
V.settings = () => {
  const st = S.set, it = (id, l, v, attr = '') => `<button type="button" class="it" ${id ? `id="${id}"` : ''} ${attr}>${l}<span>${v}</span></button>`;
  return subhdr('Settings', '#home') + `<div class="setgrid">
  <section><h2 class="sec">Money</h2><div class="set">${it('bankset', 'Bank balance', S.bank[0] ? usd(S.bank[0].balance) : 'Add')}${it('', 'Safety cushion', usd(st.cushion), 'data-num="cushion"')}</div>
  <h2 class="sec">Rent</h2><div class="set">${it('', 'Monthly rent', usd(st.rent), 'data-num="rent"')}${it('', 'Due day', `Day ${st.rentDueDay} of the month`, 'data-num="rentDueDay"')}</div>
  <h2 class="sec">Payroll</h2><div class="set">${it('', 'Manager weekly extra', usd(st.managerBonus), 'data-num="managerBonus"')}${it('payday', 'Payday', DOWL[st.payday ?? 5])}</div>
  <div class="sech"><h2 class="sec">Staff</h2><button type="button" class="lnk" id="addstaff">Add</button></div><div class="set">${st.staff.map(s => it('', esc(s.name) + (s.manager ? ' (manager)' : ''), `${usd(s.rate)} an hour`, `data-staff="${s.id}"`)).join('')}</div></section>
  <section><div class="sech"><h2 class="sec">Delivery apps</h2><button type="button" class="lnk" id="addapp">Add</button></div><div class="set">${st.deliveryApps.map((a, i) => it('', esc(a), 'Rename', `data-app="${i}"`)).join('')}</div>
  <h2 class="sec">Close-out reminders</h2><div class="set">${it('notif', `Reminders at ${SHIFTS.map(s => fmtT(s.end)).join(', ')}`, S.set.notify && Notify.state() === 'granted' ? 'On' : Notify.state() === 'denied' ? 'Blocked in browser settings' : Notify.state() === 'unsupported' ? 'Not available here' : 'Off')}</div><p class="note">Shows while the app is open or recently used. On iPhone, add it to the Home Screen first. The banner on Home always shows what is due.</p>
  <h2 class="sec">Shift times</h2><div class="set">${SHIFTS.map(s => it('', s.k, s.t, `data-shift="${s.k}"`)).join('')}</div>
  <h2 class="sec">Google Sheets</h2><div class="set">${it('syncset', 'Connection', S.sync.url ? 'Connected' : 'Not set up')}${it('syncnow', 'Sync now', '<span id="syncstat">Checking</span>')}</div>
  <h2 class="sec">Theme</h2><div class="skins" role="radiogroup" aria-label="Theme">${SKINS.map(([k, n, d, c]) => `<button type="button" role="radio" class="skin" data-skin="${k}" aria-checked="${(st.skin || 'brass') === k}"><span class="sw" aria-hidden="true">${c.map(x => `<i style="background:${x}"></i>`).join('')}</span><b>${n}</b><small>${d}</small></button>`).join('')}</div>
  <h2 class="sec">App</h2><div class="set">${it('theme', 'Look', { auto: 'Match device', light: 'Light', dark: 'Dark' }[st.theme || 'auto'])}${it('chpin', 'Change PIN', PIN ? 'On' : 'Off')}${it('locknow', 'Lock now', 'Locks by itself after 2 minutes away')}${it('backup', 'Download a backup', '.json file')}${it('impset', 'Import starting data', '.json file')}<div class="it">Storage<span id="persist">Checking</span></div></div>
  <p class="note">Everything saves on this device first, then copies to your Google Sheet when online.</p></section></div>`;
};
V.settings.nav = 'settings';
V.settings.wire = async () => {
  const st = S.set;
  const num = (title, key) => padSheet({ title, money: key !== 'rentDueDay', int: key === 'rentDueDay', value: st[key], label: key === 'rentDueDay' ? 'Day of month' : 'Amount', onSave: async n => { n = +n; if (key === 'rentDueDay' && (n < 1 || n > 31)) { toast('Pick a day from 1 to 31'); return false; } st[key] = n; await save('settings', st); render('settings'); } });
  $$('[data-num]').forEach(b => b.onclick = () => num(b.childNodes[0].textContent, b.dataset.num));
  $('#payday').onclick = async () => { st.payday = ((st.payday ?? 5) + 1) % 7; await save('settings', st); render('settings'); };
  const staffSheet = s => { const isNew = !s; s = s || { id: 's' + Date.now(), name: '', role: '', rate: '', manager: false };
    padSheet({ title: isNew ? 'New staff member' : s.name, label: 'Hourly rate', value: s.rate, cta: 'Save', extraTop: `<label class="l" for="sn">Name</label><input class="txt" id="sn" value="${esc(s.name)}"><label class="l" for="sr">Job</label><input class="txt" id="sr" value="${esc(s.role)}" placeholder="Register, Deli, Stock…"><label class="l chkl"><input type="checkbox" id="sm" ${s.manager ? 'checked' : ''}> Manager (gets the weekly extra)</label>`,
      onSave: async (n, w) => { const name = w.querySelector('#sn').value.trim(); if (!name) { toast('Add a name'); return false; } Object.assign(s, { name, role: w.querySelector('#sr').value.trim(), rate: n, manager: w.querySelector('#sm').checked }); if (isNew) st.staff.push(s); await save('settings', st); render('settings'); },
      onDelete: isNew ? null : async () => { st.staff = st.staff.filter(x => x !== s); await save('settings', st); render('settings'); } }); };
  $('#addstaff').onclick = () => staffSheet();
  $$('[data-staff]').forEach(b => b.onclick = () => staffSheet(st.staff.find(s => s.id === b.dataset.staff)));
  const appSheet = i => { const isNew = i === undefined; const s = openSheet({ label: 'Delivery app', html: `<h3>${isNew ? 'New delivery app' : 'Rename app'}</h3><label class="l" for="an">App name</label><input class="txt" id="an" autocomplete="off" value="${isNew ? '' : esc(st.deliveryApps[i])}" placeholder="Postmates…"><button type="button" class="save" data-ok>Save app</button>${isNew ? '' : '<button type="button" class="save ghost" data-del>Remove from list</button>'}` }), w = s.el;
    w.querySelector('#an').focus();
    w.querySelector('[data-ok]').onclick = async () => { const n = w.querySelector('#an').value.trim(); if (!n) { toast('Add the app name'); return; } if (st.deliveryApps.some((x, j) => x.toLowerCase() === n.toLowerCase() && j !== i)) { toast(`${n} is already in the list`); return; } if (isNew) st.deliveryApps.push(n); else st.deliveryApps[i] = n; await save('settings', st); s.close(); render('settings'); };
    if (!isNew) w.querySelector('[data-del]').onclick = async () => { if (!confirm(`Remove ${st.deliveryApps[i]}? Payouts already saved stay in your books.`)) return; st.deliveryApps.splice(i, 1); await save('settings', st); s.close(); render('settings'); }; };
  $('#addapp').onclick = () => appSheet();
  $$('[data-app]').forEach(b => b.onclick = () => appSheet(+b.dataset.app));
  $('#impset').onclick = pickImport;
  $('#notif').onclick = async () => { if (S.set.notify && Notify.state() === 'granted') { S.set.notify = false; await save('settings', S.set); } else { const r = await Notify.ask(); if (r === 'denied') toast('Notifications are blocked. Allow them in your browser or phone settings.'); } render('settings'); };
  $('#chpin').onclick = () => pinScreen(PIN ? 'change' : 'create', () => render('settings'));
  $('#locknow').onclick = lockNow;
  $('#bankset').onclick = bankSheet;
  $$('.skin[data-skin]').forEach(b => b.onclick = async () => { st.skin = b.dataset.skin; st.theme = SKIN_MODE[st.skin]; await save('settings', st); applyTheme(); render('settings'); });
  $$('[data-shift]').forEach(b => b.onclick = shiftTimesSheet);
  $('#theme').onclick = async () => { st.theme = { auto: 'light', light: 'dark', dark: 'auto' }[st.theme || 'auto']; await save('settings', st); render('settings'); };
  $('#syncset').onclick = () => { const s = openSheet({ label: 'Google Sheets connection', html: `<h3>Google Sheets</h3><p class="sub">Paste the web app link and the secret word from the setup steps.</p><label class="l" for="su">Web app link</label><input class="txt" id="su" type="url" inputmode="url" autocomplete="off" spellcheck="false" value="${esc(S.sync.url)}" placeholder="https://script.google.com/macros/s/.../exec"><label class="l" for="ss">Secret word</label><input class="txt" id="ss" autocomplete="off" spellcheck="false" value="${esc(S.sync.secret)}"><button type="button" class="save" data-ok>Save and send</button>` }), w = s.el;
    w.querySelector('[data-ok]').onclick = async () => { const url = w.querySelector('#su').value.trim(); if (url && !/^https:\/\/script\.google\.com\//.test(url)) { toast('The link should start with https://script.google.com/'); return; } S.sync = { id: 'sync', url, secret: w.querySelector('#ss').value.trim() }; await DB.put('settings', S.sync); s.close(); await Sync.resetPull(); await queueAll(); await Sync.run(); render('settings'); }; };
  $('#syncnow').onclick = () => { Sync.run(); toast('Syncing…'); };
  $('#backup').onclick = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...S, sync: { url: S.sync.url } }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `deli-books-${bizDate()}.json`; a.click(); };
  const p = await navigator.storage?.persisted?.(); $('#persist') && ($('#persist').textContent = p ? 'Kept safe (persistent)' : 'Normal. Add to Home Screen to keep it safe');
  paintSyncStat();
};
async function paintSyncStat() {
  const el = $('#syncstat'); if (!el) return; const s = await Sync.status();
  const hm = s.pulledAt ? new Date(s.pulledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  el.textContent = !S.sync.url ? 'Off' : (s.pending ? `${s.pending} waiting` : 'All sent') + (hm ? ` · Synced ${hm}` : '');
}
Sync.on(paintSyncStat);
// When Sheets is first connected, queue everything already here so the sheet starts complete.
async function queueAll() {
  const q = await DB.all('outbox'); if (q.length) return;
  for (const [st, tab] of [['delivery', 'Delivery'], ['shifts', 'Shifts'], ['checks', 'Checks'], ['bank', 'Bank'], ['payroll', 'Payroll']]) for (const r of await DB.all(st)) await DB.put(st, r, tab);
  for (const w of shiftWin()) await DB.put('settings', { id: 'shift-' + w.k, shift: w.k, start: w.start, end: w.end }, 'ShiftTimes');
  await load();
}

// Edit all three shifts at once so the ends and starts can be kept matched.
function shiftTimesSheet() {
  const win = shiftWin();
  const row = w => `<fieldset class="tset"><legend>${w.k}</legend><label>Starts<input type="time" class="txt" id="ts-${w.k}" value="${w.start}" step="60"></label><label>Ends<input type="time" class="txt" id="te-${w.k}" value="${w.end}" step="60"></label></fieldset>`;
  const s = openSheet({ label: 'Shift times', html: `<h3>Shift times</h3><p class="sub">To the minute. Each shift ends when the next one starts. Overnight runs past midnight, and anything before Morning starts counts toward the night before.</p>${win.map(row).join('')}<p class="err" id="terr" role="alert"></p><button type="button" class="save" id="tsave">Save shift times</button><button type="button" class="save ghost" id="tdef">Back to 6 AM, 2 PM, 7 PM</button>` });
  const el = s.el, read = () => win.map(w => ({ k: w.k, start: el.querySelector('#ts-' + w.k).value, end: el.querySelector('#te-' + w.k).value }));
  // Typing an end fills the next start (and the other way) so they stay matched.
  win.forEach((w, i) => { const nx = win[(i + 1) % 3].k; el.querySelector('#te-' + w.k).onchange = e => { el.querySelector('#ts-' + nx).value = e.target.value; }; el.querySelector('#ts-' + nx).onchange = e => { el.querySelector('#te-' + w.k).value = e.target.value; }; });
  el.querySelector('#tdef').onclick = () => { shiftWin(DEF_TIMES).forEach(w => { el.querySelector('#ts-' + w.k).value = w.start; el.querySelector('#te-' + w.k).value = w.end; }); };
  el.querySelector('#tsave').onclick = async () => {
    const v = read(), err = checkTimes(v); el.querySelector('#terr').textContent = err; if (err) return;
    S.set.shiftTimes = Object.fromEntries(v.map(w => [w.k, w.start])); await save('settings', S.set); refreshShifts(); queueShiftTimes(); Notify.schedule(); s.close(); stamp('Shift times saved'); render('settings');
  };
}
// One row per shift on the ShiftTimes tab, so the sheet (and Clover.gs) use the same times.
async function queueShiftTimes() { for (const w of shiftWin()) await DB.put('settings', { id: 'shift-' + w.k, shift: w.k, start: w.start, end: w.end }, 'ShiftTimes'); Sync.run(); }
