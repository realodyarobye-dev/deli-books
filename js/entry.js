/* Close out a shift, and delivery app payouts. Each screen owns one pad (screen key layer). */
V.entry = (k, date) => {
  date = date && /^\d{4}-\d\d-\d\d$/.test(date) ? date : bizDate(); k = SHIFTS.some(s => s.k === k) ? k : curShift();
  const ex = shiftRec(date, k), dn = (n) => addDays(date, n);
  return subhdr('Close out', '#home') + `<div class="entrygrid"><div>
  <div class="daynav"><a class="icon" href="#entry/${k}/${dn(-1)}" aria-label="Previous day">${ICON.back}</a><b>${date === bizDate() ? 'Today' : nice(date)}</b>${date < bizDate() ? `<a class="icon" href="#entry/${k}/${dn(1)}" aria-label="Next day">${ICON.next}</a>` : '<span class="icon off" aria-hidden="true"></span>'}</div>
  <div class="seg" role="group" aria-label="Shift">${SHIFTS.map(s => `<a href="#entry/${s.k}/${date}" aria-current="${s.k === k}">${s.k}${shiftRec(date, s.k) ? ' ✓' : ''}<small>${s.t}</small></a>`).join('')}</div>
  <div class="adj"><span id="adjline">${(() => { const sp = shiftSpan(date, k); return `${fmtT(sp.startT)} to ${fmtT(sp.endT)}${ex?.start || ex?.end ? ' (adjusted for this day)' : ''}`; })()}</span><button type="button" class="lnk" id="adjbtn" aria-expanded="false" aria-controls="adjbox">Adjust times</button></div>
  <div class="adjbox" id="adjbox" hidden><label>Started<input type="time" class="txt" id="adjs" step="60"></label><label>Ended<input type="time" class="txt" id="adje" step="60"></label><p class="sub sm">Only for this ${k.toLowerCase()} shift on this day. Settings > Shift times changes every day.</p></div>
  <div class="clover" id="clover" hidden aria-live="polite"></div>
  <div class="fields">${fieldHtml('cc', { label: 'Card', sub: 'Credit card batch' })}${fieldHtml('cash', { label: 'Cash', sub: 'In the drawer' })}${fieldHtml('out', { label: 'Paid out', sub: 'Taken from the drawer' })}</div>
  <div class="total"><span>${k} total</span><b id="etot"></b></div><p class="hintk">Card plus cash plus paid out. On a keyboard: type numbers, Tab or arrows to move, Enter to save.</p>
  </div><div>${padHtml()}<button class="save" id="save" type="button">${ex ? 'Update' : 'Save'} ${k.toLowerCase()} shift</button><a class="save ghost" href="#delivery//${date}">Delivery app payouts</a></div></div>`;
};
V.entry.title = 'Close out';
V.entry.wire = (k, date) => {
  date = date && /^\d{4}-\d\d-\d\d$/.test(date) ? date : bizDate(); k = SHIFTS.some(s => s.k === k) ? k : curShift();
  const r = shiftRec(date, k), v = x => r && x ? String(x) : '';
  const p = Pad({ root: $('#main'), layer: 'screen', fields: { cc: { v: v(r?.cc) }, cash: { v: v(r?.cash) }, out: { v: v(r?.out) } }, order: ['cc', 'cash', 'out'],
    onChange: p => { $('#etot').textContent = usd(p.val('cc') + p.val('cash') + p.val('out')); }, onEnter: () => $('#save').click(), onEsc: () => { location.hash = 'home'; } });
  $('#main [data-f="cc"]').focus({ preventScroll: true });
  const sp = shiftSpan(date, k), adjVal = () => { const box = $('#adjbox'); if (box.hidden) return r?.start || r?.end ? { start: r.start, end: r.end } : null; return { start: $('#adjs').value || sp.startT, end: $('#adje').value || sp.endT }; };
  $('#adjs').value = sp.startT; $('#adje').value = sp.endT;
  $('#adjbtn').onclick = () => { const box = $('#adjbox'); box.hidden = !box.hidden; $('#adjbtn').setAttribute('aria-expanded', !box.hidden); if (!box.hidden) $('#adjs').focus(); };
  const reclover = () => { $('#adjline').textContent = `${fmtT($('#adjs').value || sp.startT)} to ${fmtT($('#adje').value || sp.endT)}`; if (!r) Clover.card(date, k, p, adjVal()); };
  $('#adjs').onchange = reclover; $('#adje').onchange = reclover;
  if (!r) Clover.card(date, k, p, adjVal());
  $('#save').onclick = async () => {
    const rec = { id: `${date}|${k}`, date, shift: k, cc: p.val('cc'), cash: p.val('cash'), out: p.val('out') }; rec.net = net(rec);
    // Adjusted times are kept only when they differ from the usual shift times.
    const a = adjVal(), d0 = SHIFTS.find(s => s.k === k);
    if (a && (a.start !== d0.start || a.end !== d0.end)) { if (!a.start || !a.end || a.start === a.end) { toast('Add both a start and an end time'); return; } rec.start = a.start; rec.end = a.end; }
    await save('shifts', rec, 'Shifts'); stamp('Saved');
    const fl = anomalies(rec);
    if (!fl.length) return setTimeout(() => { location.hash = 'home'; }, 600);
    const s = openSheet({ label: 'Worth a look', html: `<h3>Worth a look</h3><p class="sub">${k} shift saved at ${usd(rec.net)}. A couple of things stand out:</p>${flagList(fl)}<button type="button" class="save" data-done>Got it</button><a class="save ghost" href="#entry/${k}/${date}" data-fix>Fix the numbers</a>` });
    s.el.classList.add('anom'); s.el.querySelector('[data-done]').onclick = () => { s.close(); location.hash = 'home'; }; s.el.querySelector('[data-fix]').onclick = () => s.close();
    s.el.querySelector('[data-done]').focus();
  };
};
V.entry.bare = false; V.entry.nav = 'entry';

V.delivery = (a, date) => {
  const apps = S.set.deliveryApps; date = date && /^\d{4}/.test(date) ? date : bizDate(); a = apps.includes(a) ? a : (apps.find(x => !delivRec(date, x)) || apps[0]);
  const ex = delivRec(date, a);
  return subhdr('Delivery payouts', '#home') + `<div class="entrygrid"><div>
  <div class="daynav"><a class="icon" href="#delivery/${encodeURIComponent(a)}/${addDays(date, -1)}" aria-label="Previous day">${ICON.back}</a><b>${date === bizDate() ? 'Today' : nice(date)}</b>${date < bizDate() ? `<a class="icon" href="#delivery/${encodeURIComponent(a)}/${addDays(date, 1)}" aria-label="Next day">${ICON.next}</a>` : '<span class="icon off" aria-hidden="true"></span>'}</div>
  <div class="seg" role="group" aria-label="Delivery app">${apps.map(x => `<a href="#delivery/${encodeURIComponent(x)}/${date}" aria-current="${x === a}">${esc(x)}${delivRec(date, x) ? ' ✓' : ''}<small>${delivRec(date, x) ? usd(delivRec(date, x).amount) : 'Not entered'}</small></a>`).join('')}</div>
  <div class="fields">${fieldHtml('amt', { label: a, sub: 'Payout for the day' })}</div>
  <div class="total"><span>All delivery apps this day</span><b id="dtot"></b></div></div>
  <div>${padHtml()}<button class="save" id="save" type="button">${ex ? 'Update' : 'Save'} ${esc(a)} payout</button></div></div>`;
};
V.delivery.nav = 'entry';
V.delivery.wire = (a, date) => {
  const apps = S.set.deliveryApps; date = date && /^\d{4}/.test(date) ? date : bizDate(); a = apps.includes(a) ? a : (apps.find(x => !delivRec(date, x)) || apps[0]);
  const others = sum(apps.filter(x => x !== a), x => delivRec(date, x)?.amount || 0), r = delivRec(date, a);
  const p = Pad({ root: $('#main'), layer: 'screen', fields: { amt: { v: r?.amount ? String(r.amount) : '' } }, onChange: p => { $('#dtot').textContent = usd(others + p.val('amt')); }, onEnter: () => $('#save').click(), onEsc: () => { location.hash = 'home'; } });
  $('#main [data-f="amt"]').focus({ preventScroll: true });
  $('#save').onclick = async () => {
    await save('delivery', { id: `${date}|${a}`, date, app: a, amount: p.val('amt') }, 'Delivery'); stamp('Saved');
    const next = apps.find(x => !delivRec(date, x));
    setTimeout(() => { location.hash = next ? `delivery/${encodeURIComponent(next)}/${date}` : 'home'; }, 500);
  };
};
