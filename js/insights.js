/* Anomaly flags, reminders and Insights. */
// Flags for a just-saved shift: sales vs the same weekday and shift, and unusually high paid outs.
function anomalies(rec) {
  const out = [], dow = parse(rec.date).getDay(), t = net(rec);
  const same = S.shifts.filter(r => r.shift === rec.shift && r.date < rec.date && r.date >= addDays(rec.date, -56) && parse(r.date).getDay() === dow);
  if (same.length >= 3) {
    const a = avg(same.map(net)), d = pct(t, a);
    if (d <= -30) out.push({ lvl: 'bad', t: `Sales are ${Math.round(-d)}% below a usual ${DOWL[dow]} ${rec.shift.toLowerCase()}`, s: `${usd0(t)} against an average of ${usd0(a)} over the last ${same.length}.` });
    else if (d >= 40) out.push({ lvl: 'good', t: `Sales are ${Math.round(d)}% above a usual ${DOWL[dow]} ${rec.shift.toLowerCase()}`, s: `${usd0(t)} against an average of ${usd0(a)}. Worth checking the count.` });
  }
  const outs = S.shifts.filter(r => r.shift === rec.shift && r.date < rec.date && r.date >= addDays(rec.date, -42)).map(r => +r.out || 0);
  const o = +rec.out || 0;
  if (outs.length >= 3) { const a = avg(outs); if (o >= 50 && o > Math.max(a * 2, a + 100)) out.push({ lvl: 'warn', t: `Paid outs are high: ${usd0(o)}`, s: `A usual ${rec.shift.toLowerCase()} pays out about ${usd0(a)}. Check the receipts.` }); }
  if (t > 0 && o / t > 0.3 && o >= 100) out.push({ lvl: 'warn', t: `Paid outs are ${Math.round(o / t * 100)}% of this shift`, s: 'Most shifts are well under that.' });
  return out;
}
// Reminders for Home: rent, old checks, payday, stale bank balance.
function reminders(today = bizDate()) {
  const out = [], r = rentInfo(today);
  if (r.rent && !r.paid && r.late) out.push({ lvl: 'bad', t: `Rent is ${-r.days} days late`, s: `${usd0(r.rent)} was due ${short(r.due)}. Tap the rent card once it is paid.`, href: '#home' });
  else if (r.rent && !r.paid && r.days <= 5) out.push({ lvl: 'warn', t: r.days ? `Rent is due in ${r.days} day${r.days === 1 ? '' : 's'}` : 'Rent is due today', s: `${usd0(r.rent)} on ${short(r.due)}.`, href: '#home' });
  const old = openChecks().filter(c => c.date && daysBetween(c.date, today) > 10);
  if (old.length) out.push({ lvl: 'warn', t: `${old.length} check${old.length > 1 ? 's' : ''} out more than 10 days`, s: `${usd0(sum(old, c => c.amount))} total. Oldest: ${old.sort((a, b) => a.date.localeCompare(b.date)).map(c => `#${c.num} ${c.vendor}`)[0]}.`, href: '#money/checks' });
  const pd = S.set.payday ?? 5, dow = parse(today).getDay(), until = (pd - dow + 7) % 7, ws = weekStart(today), owe = payUnpaid(ws);
  if (owe > 0 && until <= 2) out.push({ lvl: until ? 'info' : 'warn', t: until ? `Payday is ${DOWL[pd]}` : 'Payday is today', s: `${usd0(owe)} still to pay this week.`, href: '#money/payroll' });
  const o = okay(); if (o.bank && o.stale > 3) out.push({ lvl: 'info', t: `Bank balance is ${o.stale} days old`, s: 'Update it so "Am I okay?" stays right.', act: 'bank' });
  return out;
}
const flagList = (fs) => `<ul class="flags">${fs.map(f => `<li class="${f.lvl}">${f.href ? `<a href="${f.href}">` : f.act ? `<button type="button" data-act="${f.act}">` : '<div>'}<b>${esc(f.t)}</b><small>${esc(f.s)}</small>${f.href ? '</a>' : f.act ? '</button>' : '</div>'}</li>`).join('')}</ul>`;

/* Insights */
const barsHtml = (rows, label, opts = {}) => { const mx = Math.max(...rows.map(r => r.v), 1); return `<div class="hbars" role="img" aria-label="${esc(label)}">${rows.map(r => `<div class="hb2 ${r.hi ? 'hi' : ''}"><span class="hl">${esc(r.l)}</span><span class="ht"><i style="--w:${(r.v / mx * 100).toFixed(1)}%" data-grow></i></span><b>${opts.fmt ? opts.fmt(r.v) : usd0(r.v)}</b></div>`).join('')}</div>`; };
V.insights = () => {
  const today = bizDate(), from = addDays(today, -27), days = [...Array(28)].map((_, i) => addDays(from, i)).filter(hasDay);
  if (days.length < 3) return ptitle('Insights') + `<p class="empty">Close out a few days of shifts and the patterns show up here.</p>`;
  const tot = days.map(d => ({ d, v: dayTotal(d) })).sort((a, b) => b.v - a.v), best = tot[0], worst = tot[tot.length - 1];
  const shifts = S.shifts.filter(r => r.date >= from && r.date <= today);
  const byShift = SHIFTS.map(s => { const xs = shifts.filter(r => r.shift === s.k).map(net); return { l: s.k, v: avg(xs), n: xs.length }; });
  const byDow = [1, 2, 3, 4, 5, 6, 0].map(i => { const xs = days.filter(d => parse(d).getDay() === i).map(dayTotal); return { l: DOWL[i], v: avg(xs) }; });
  const bd = byDow.reduce((a, b) => b.v > a.v ? b : a), wd = byDow.filter(x => x.v).reduce((a, b) => b.v < a.v ? b : a); bd.hi = true;
  const bs = byShift.filter(x => x.n).reduce((a, b) => b.v > a.v ? b : a), ws_ = byShift.filter(x => x.n).reduce((a, b) => b.v < a.v ? b : a);
  const counter = sum(days, storeDay), deliv = sum(days, delivDay), share = deliv / Math.max(1, counter + deliv) * 100;
  const apps = S.set.deliveryApps.map(a => ({ l: a, v: sum(S.delivery.filter(r => r.app === a && r.date >= from), r => r.amount) }));
  const ws = weekStart(today), di = (parse(today).getDay() + 6) % 7;
  const tw = sum([...Array(di + 1)].map((_, i) => dayTotal(addDays(ws, i)))), lw = sum([...Array(di + 1)].map((_, i) => dayTotal(addDays(ws, i - 7)))), wp = pct(tw, lw);
  const weeks = [...Array(8)].map((_, i) => { const s = addDays(ws, (i - 7) * 7); return { l: short(s), v: sum([...Array(7)].map((_, j) => dayTotal(addDays(s, j)))), hi: i === 7 }; }); while (weeks.length > 2 && !weeks[0].v) weeks.shift();
  const outAvg = k => avg(S.shifts.filter(r => r.date >= addDays(today, k - 14) && r.date < addDays(today, k)).map(r => +r.out || 0));
  const o1 = outAvg(1), o0 = outAvg(-13);
  return ptitle('Insights', `The last 4 weeks, ${short(from)} to ${short(today)}.`, `<a class="btn" href="#report">${ICON.report}Monthly report</a>`) + `
  <div class="igrid">
   <section class="card stat"><h2>This week so far</h2><b class="d">${usd0(tw)}</b><p>${delta(wp)} ${wp === null ? '' : `${wp >= 0 ? 'Up' : 'Down'} on the same days last week (${usd0(lw)}).`}</p></section>
   <section class="card stat"><h2>Best day</h2><b class="d">${usd0(best.v)}</b><p>${nice(best.d)}. Slowest was ${nice(worst.d)} at ${usd0(worst.v)}.</p></section>
   <section class="card stat"><h2>Delivery share</h2><b class="d">${share.toFixed(0)}%</b><p>${usd0(deliv)} from apps, ${usd0(counter)} at the counter.</p><div class="share" aria-hidden="true"><i style="--w:${share.toFixed(1)}%" data-grow></i></div></section>
   <section class="card wide"><div class="ch"><div><h2>Weekly sales</h2><p class="sub">Last ${weeks.length} weeks, week starting</p></div><b class="tv">${usd0(sum(weeks, w => w.v))}</b></div>${area({ series: [{ vals: weeks.map(w => w.v), cls: 'main' }], labels: weeks.map(w => w.l), label: 'Weekly sales for the last weeks', h: 200 })}</section>
   <section class="card"><div class="ch"><h2>Average by day of week</h2></div><p class="sub">${bd.l} is your strongest day. ${wd.l} is the slowest.</p>${barsHtml(byDow, 'Average sales by day of week')}</section>
   <section class="card"><div class="ch"><h2>Average by shift</h2></div><p class="sub">${bs.l} brings in the most, ${ws_.l} the least.</p>${barsHtml(byShift.map(x => ({ ...x, hi: x === bs })), 'Average sales by shift')}
    <div class="ch" style="margin-top:18px"><h2>Delivery apps</h2></div>${barsHtml(apps, 'Delivery payouts by app, last 4 weeks')}</section>
   <section class="card wide"><div class="ch"><h2>Paid outs</h2></div><p class="sub">Average per shift: ${usd0(o1)} in the last 2 weeks${o0 ? `, ${usd0(o0)} the 2 weeks before` : ''}.${o0 && o1 > o0 * 1.25 ? ' That is rising. Worth a look.' : ''}</p></section>
  </div><a class="save ghost rep" href="#report">Open the monthly report</a>`;
};
