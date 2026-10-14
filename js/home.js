/* Home: "Am I okay?" and today at a glance. Days: money made each day. */
// Current month only: sales so far minus checks written, payroll and rent this month.
function monthBand(today) {
  const st = monthStats(monthKey(today)), up = st.profit >= 0;
  return `<a class="mband ${up ? 'up' : 'down'}" href="#report/${st.m}" data-testid="monthband"><span class="mi" aria-hidden="true">${up ? ICON.up || '' : ICON.down || ''}</span><span class="mt"><small>This month, ${MONL[parse(st.m + '-01').getMonth()]} so far</small><b>${up ? 'In profit' : 'In the red'} by ${usd0(Math.abs(st.profit))}</b></span><span class="mx">Sales ${usd0(st.sales - st.outs)} minus checks ${usd0(st.chk)}, payroll ${usd0(st.pay)}, rent ${usd0(st.rent)}</span></a>`;
}
V.home = () => {
  const o = okay(), today = bizDate(), r = o.rent, ws = weekStart(today), di = (parse(today).getDay() + 6) % 7;
  const word = { good: 'You are okay', warn: 'Tight, but covered', bad: 'You are behind' }[o.status];
  const d14 = [...Array(14)].map((_, i) => addDays(today, i - 13)), cur = d14.map(dayTotal), prev = d14.map(d => dayTotal(addDays(d, -7)));
  const dayT = dayTotal(today), ld = addDays(today, -7);
  // Compare today with the same weekday last week, counting only the shifts closed so far today (fair mid-day).
  const lastSame = sum(S.shifts.filter(x => x.date === ld && shiftRec(today, x.shift)), net) + (delivDay(today) ? delivDay(ld) : 0);
  const tw = sum([...Array(di + 1)].map((_, i) => dayTotal(addDays(ws, i)))), lw = sum([...Array(di + 1)].map((_, i) => dayTotal(addDays(ws, i - 7))));
  const wkVals = [...Array(8)].map((_, i) => sum([...Array(7)].map((_, j) => dayTotal(addDays(ws, (i - 7) * 7 + j)))));
  const bankHist = S.bank.slice(0, 10).reverse().map(b => +b.balance);
  const parts = [['Bank balance', o.bal, 'e-bank'], ['Checks still out', -o.fl, 'e-chk'], [r.paid ? 'Rent paid' : `Rent due ${short(r.due)}`, -r.owed, 'e-rent'], ['Payroll still owed', -o.pw, 'e-pay']];
  const tot = Math.max(o.bal, o.fl + r.owed + o.pw, 1), rs = reminders();
  const act = [...S.shifts.map(x => ({ at: x.updatedAt, t: `${x.shift} close-out`, d: x.date, a: net(x), k: 'Shift', h: `#entry/${x.shift}/${x.date}` })), ...S.delivery.map(x => ({ at: x.updatedAt, t: `${x.app} payout`, d: x.date, a: +x.amount, k: 'Delivery', h: `#delivery/${encodeURIComponent(x.app)}/${x.date}` })), ...S.checks.map(x => ({ at: x.updatedAt, t: `Check #${x.num}, ${x.vendor}`, d: x.date || '', a: -x.amount, k: x.cleared ? 'Cleared' : 'Check', h: '#money/checks' })), ...S.bank.map(x => ({ at: x.updatedAt, t: 'Bank balance', d: x.date, a: +x.balance, k: 'Bank', h: '#home', bal: 1 }))].filter(x => x.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  const kpi = (lbl, val, sub, sp, extra = '', cls = '') => `<div class="kpi ${cls}"><div class="kl">${lbl}</div><div class="kv">${val}</div><div class="ks">${sub}</div>${sp ? `<div class="ksp">${sp}</div>` : ''}${extra}</div>`;
  return ptitle('Home', `${nice(today)}. Here is where the money stands.`, `<a class="btn primary" href="#entry">${ICON.plus}Close out a shift</a>`) + banners() + monthBand(today) + `
  <section class="kpis" aria-label="Key numbers">
    ${kpi("Today's sales", usd0(dayT), `${delta(pct(dayT, lastSame))} <span>vs last ${DOW[parse(today).getDay()]}, same shifts</span>`, spark(cur.slice(-8, -1).concat(dayT ? [] : []), { up: (pct(dayT, lastSame) ?? 0) >= 0 }))}
    ${kpi('This week', usd0(tw), `${delta(pct(tw, lw))} <span>vs same days last week</span>`, spark(wkVals, { up: (pct(tw, lw) ?? 0) >= 0 }))}
    <div class="kpi hero ${o.status}"><div class="kl">Am I okay? <span class="status"><i></i>${word}</span></div><div class="kv" data-testid="okay">${o.v < 0 ? '-$' : '$'}${fmt(Math.abs(o.v))}</div><p class="line ks">${esc(o.line)}</p></div>
    ${kpi('Checks out', usd0(o.fl), `<span>${openChecks().length} not cleared</span>`, bankHist.length > 1 ? '' : '', '', 'link" data-href="#money/checks')}
  </section>
  <div class="dash">
   <div class="colm">
    <section class="card chart"><div class="ch"><div><h2>Sales</h2><p class="sub">Last 14 days, with the 7 days before as a dashed line</p></div><b class="tv">${usd0(sum(cur))}</b></div>
      ${area({ series: [{ vals: cur, cls: 'main' }, { vals: prev, cls: 'prev' }], labels: d14.map(short), label: 'Daily sales for the last 14 days' })}
      <div class="legend"><span><i class="lm"></i>This period</span><span><i class="lp"></i>Week before</span></div></section>
    <section class="card okcard" aria-labelledby="okh"><div class="ch"><h2 id="okh">Yours to use</h2><button class="btn" id="bankbtn" type="button">${ICON.bank}${o.bank ? `Bank as of ${short(o.bank.date)}${o.stale > 2 ? `, ${o.stale} days old` : ''}` : 'Enter bank balance'}</button></div>
      <div class="ledger" aria-hidden="true"><i class="e-yours" style="--w:${Math.max(0, o.v) / tot * 100}%" data-grow></i><i class="e-chk" style="--w:${o.fl / tot * 100}%" data-grow></i><i class="e-rent" style="--w:${r.owed / tot * 100}%" data-grow></i><i class="e-pay" style="--w:${o.pw / tot * 100}%" data-grow></i></div>
      <dl class="eq">${parts.map(([l, v, c]) => `<div class="${c}"><dt><span class="dot"></span>${esc(l)}</dt><dd>${v < 0 ? '−' : ''}${usd(Math.abs(v))}</dd></div>`).join('')}<div class="res"><dt>Yours to use</dt><dd>${usd(o.v)}</dd></div></dl></section>
    <section class="card tablecard" aria-labelledby="acth"><div class="ch"><h2 id="acth">Recent activity</h2><a class="lnk" href="#days">All days</a></div>
      ${act.length ? `<table class="tbl"><thead><tr><th scope="col">Entry</th><th scope="col">Type</th><th scope="col">Date</th><th scope="col" class="num">Amount</th></tr></thead><tbody>${act.map(x => `<tr data-href="${x.h}"><td><a href="${x.h}">${esc(x.t)}</a></td><td><span class="tag t-${x.k.toLowerCase()}">${x.k}</span></td><td>${x.d ? short(x.d) : ''}</td><td class="num ${x.a < 0 ? 'out' : ''}">${x.a < 0 ? '−' : ''}${usd(Math.abs(x.a))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nothing entered yet.</p>'}</section>
   </div>
   <div class="cols">
    ${rs.length ? `<section class="card rem" aria-labelledby="remh"><div class="ch"><h2 id="remh">Needs attention</h2><span class="count">${rs.length}</span></div>${flagList(rs)}</section>` : ''}
    <section class="card today" aria-labelledby="tdh"><div class="ch"><h2 id="tdh">Today's close-outs</h2><b class="tv">${usd(dayT)}</b></div>
    <div class="list">${SHIFTS.map(s => { const x = shiftRec(today, s.k); return `<a href="#entry/${s.k}/${today}" class="shift ${x ? 'done' : ''}"><span class="st">${x ? ICON.check : ''}</span><span class="sk">${s.k}<small>${x ? `Card ${usd(x.cc)}, cash ${usd(x.cash)}, out ${usd(x.out)}` : s.t}</small></span><span class="amt ${x ? '' : 'empty'}">${x ? usd(net(x)) : 'Add'}</span></a>`; }).join('')}
    <a href="#delivery" class="shift ${delivDay(today) ? 'done' : ''}"><span class="st">${delivDay(today) ? ICON.check : ''}</span><span class="sk">Delivery apps<small>${S.set.deliveryApps.map(esc).join(', ')}</small></span><span class="amt ${delivDay(today) ? '' : 'empty'}">${delivDay(today) ? usd(delivDay(today)) : 'Add'}</span></a></div></section>
    <button class="card mini" id="rentbtn" type="button"><span class="kl">Rent ${usd(r.rent)}</span><b class="kv ${r.late ? 'neg' : ''}">${r.paid ? 'Paid' : r.late ? `${-r.days} days late` : `Due in ${r.days} days`}</b><small>${r.paid ? `Next due ${short(r.due)}. Tap to undo` : 'Tap when paid'}</small></button>
   </div>
  </div>`;
};
V.home.title = 'Home';
V.home.wire = () => {
  $('#bankbtn').onclick = bankSheet; $$('[data-href]').forEach(el => el.addEventListener('click', e => { if (!e.target.closest('a,button')) location.hash = el.dataset.href.slice(1); })); $$('[data-act=bank]').forEach(b => b.onclick = bankSheet);
  $('#rentbtn').onclick = async () => { const r = rentInfo(); S.set.rentPaidMonth = r.paid ? '' : monthKey(bizDate()); await save('settings', S.set); if (!r.paid) stamp('Rent paid'); go(); };
};
function bankSheet() { padSheet({ title: 'Bank balance', sub: `As of ${nice(bizDate())}`, value: S.bank[0]?.balance, label: 'Balance', cta: 'Save balance', onSave: async n => { const d = bizDate(); await save('bank', { id: d, date: d, balance: n }, 'Bank'); stamp('Saved'); go(); } }); }

V.days = () => {
  const today = bizDate(), dates = [...new Set([...S.shifts, ...S.delivery].map(r => r.date))].filter(d => d <= today).sort().reverse();
  const mx = Math.max(...dates.map(dayTotal), 1);
  return ptitle('Days', 'Each day: card plus cash plus paid outs, plus delivery apps.') + `
  <div class="list days">${dates.map(d => { const st = storeDay(d), dl = delivDay(d), t = st + dl; return `<a class="day" href="#day/${d}"><span class="dn">${nice(d)}<small>Counter ${usd(st)}, delivery ${usd(dl)}</small></span><span class="bar" aria-hidden="true"><i style="--w:${t / mx * 100}%"></i></span><b class="amt">${usd(t)}</b></a>`; }).join('') || '<p class="empty">No days yet. Close out a shift to start.</p>'}</div>`;
};
V.day = d => {
  const rows = SHIFTS.map(s => [s, shiftRec(d, s.k)]), apps = S.set.deliveryApps;
  return subhdr(nice(d), '#days') + `<div class="card"><div class="ch"><h2>Total</h2><b class="d big2">${usd(dayTotal(d))}</b></div>
  <div class="list">${rows.map(([s, r]) => `<a class="shift ${r ? 'done' : ''}" href="#entry/${s.k}/${d}"><span class="sk">${s.k}<small>${r ? `Card ${usd(r.cc)}, cash ${usd(r.cash)}, out ${usd(r.out)}` : 'Not entered'}</small></span><span class="amt">${r ? usd(net(r)) : 'Add'}</span></a>`).join('')}
  ${apps.map(a => `<a class="shift" href="#delivery/${encodeURIComponent(a)}/${d}"><span class="sk">${esc(a)}<small>Delivery payout</small></span><span class="amt">${usd(delivRec(d, a)?.amount || 0)}</span></a>`).join('')}</div></div>`;
};
V.day.nav = 'days';
