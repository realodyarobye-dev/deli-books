/* Monthly one-page report. Print or "Save as PDF" from the browser print dialog. */
function monthStats(m) {
  const first = m + '-01', n = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(), days = [...Array(n)].map((_, i) => addDays(first, i));
  const counter = sum(days, storeDay), deliv = sum(days, delivDay), outs = sum(S.shifts.filter(r => monthKey(r.date) === m), r => r.out);
  const checks = S.checks.filter(c => c.date && monthKey(c.date) === m), chk = sum(checks, c => c.amount);
  const weeks = [...new Set(S.payroll.map(p => p.week))].filter(w => monthKey(w) === m), pay = sum(weeks, payWeekTotal);
  const rent = +S.set.rent || 0, sales = counter + deliv, exp = chk + pay + rent + outs;
  const byVendor = Object.entries(checks.reduce((a, c) => (a[c.vendor] = (a[c.vendor] || 0) + (+c.amount || 0), a), {})).sort((a, b) => b[1] - a[1]);
  return { m, days, counter, deliv, outs, chk, checks, pay, weeks, rent, sales, exp, profit: sales - exp, byVendor, open: days.filter(hasDay).length };
}
V.report = (m) => {
  const today = bizDate(); m = /^\d{4}-\d\d$/.test(m || '') ? m : monthKey(today);
  const st = monthStats(m), prevM = monthKey(addDays(m + '-01', -1)), nextM = monthKey(addDays(m + '-01', 32)), pv = monthStats(prevM);
  // For the month in progress, compare with the same days of last month, not the whole month.
  const partial = m === monthKey(today), cut = +today.slice(8), pvSales = partial ? sum(pv.days.filter(d => +d.slice(8) <= cut), dayTotal) : pv.sales;
  const mx = Math.max(...st.days.map(dayTotal), 1), sp = pct(st.sales, pvSales), perDay = st.open ? st.sales / st.open : 0;
  const line = (l, v, cls = '') => `<div class="rl2 ${cls}"><span>${l}</span><b>${usd0(v)}</b></div>`;
  return `<div class="report">
  <header class="rhead noprint-nav"><a class="icon noprint" href="#report/${prevM}" aria-label="Previous month">${ICON.back}</a><div class="rt">${logo()}<div><h1>${monthName(m)}</h1><p class="sub">NY Grill &amp; Deli, monthly report</p></div></div>${m < monthKey(today) ? `<a class="icon noprint" href="#report/${nextM}" aria-label="Next month">${ICON.next}</a>` : '<span class="icon off noprint"></span>'}</header>
  <div class="rkpi"><div><small>Sales</small><b class="d">${usd0(st.sales)}</b><span>${sp === null ? 'No prior month' : `${sp >= 0 ? 'Up' : 'Down'} ${Math.abs(sp).toFixed(1)}% on ${MON[parse(prevM + '-01').getMonth()]}${partial ? ` 1 to ${cut}` : ''}`}</span></div>
   <div><small>Expenses</small><b class="d">${usd0(st.exp)}</b><span>Checks, payroll, rent, paid outs</span></div>
   <div class="${st.profit < 0 ? 'neg' : ''}"><small>Profit</small><b class="d">${usd0(st.profit)}</b><span>${st.sales ? `${(st.profit / st.sales * 100).toFixed(1)}% of sales` : ''}</span></div></div>
  <section class="rchart"><h2>Money made each day</h2><div class="mbars" role="img" aria-label="Daily sales for ${monthName(m)}">${st.days.map(d => `<i style="--h:${(dayTotal(d) / mx).toFixed(3)}" title="${short(d)} ${usd0(dayTotal(d))}"></i>`).join('')}</div><p class="sub">${st.open} days with sales, ${usd0(perDay)} a day on average.</p></section>
  <div class="rcols"><section><h2>Sales</h2>${line('Counter (card, cash, paid out)', st.counter)}${line('Delivery apps', st.deliv)}${line('Total', st.sales, 'tot')}</section>
   <section><h2>Expenses</h2>${line(`Checks written (${st.checks.length})`, st.chk)}${line(`Payroll (${st.weeks.length} week${st.weeks.length === 1 ? '' : 's'})`, st.pay)}${line('Rent', st.rent)}${line('Paid outs from the drawer', st.outs)}${line('Total', st.exp, 'tot')}</section></div>
  ${st.byVendor.length ? `<section><h2>Checks by vendor</h2>${st.byVendor.slice(0, 8).map(([v, a]) => line(esc(v), a)).join('')}</section>` : ''}
  <p class="note">Checks count in the month they were written. Payroll counts by the week's start date. Paid outs are counted in sales (they came out of the drawer) and again here as spending.</p>
  <button class="save noprint" id="print" type="button">${ICON.print} Print or save as PDF</button></div>`;
};
V.report.nav = 'report'; V.report.title = 'Monthly report';
V.report.wire = () => { $('#print').onclick = () => print(); };
