/* Money: checks, payroll, money owed. */
const mtabs = cur => `<div class="seg mt" role="tablist" aria-label="Money">${[['checks', 'Checks'], ['payroll', 'Payroll'], ['owed', 'Owed to you']].map(([k, l]) => `<a href="#money/${k}" role="tab" aria-selected="${cur === k}" aria-current="${cur === k}">${l}</a>`).join('')}</div>`;
let PW = null;
V.money = (tab = 'checks') => {
  tab = ['checks', 'payroll', 'owed'].includes(tab) ? tab : 'checks';
  return ptitle('Money', 'Checks, payroll and money owed to you') + mtabs(tab) + MV[tab]();
};
V.money.wire = (tab = 'checks') => MV[(['checks', 'payroll', 'owed'].includes(tab) ? tab : 'checks') + 'W']();
const MV = {};
MV.payroll = () => {
  PW = PW || weekStart(bizDate());
  const rows = payRows(PW), tot = sum(rows, x => x.pay), unpaid = sum(rows.filter(x => !x.r.paid), x => x.pay);
  return `<div class="weeknav"><button class="icon" type="button" data-w="-7" aria-label="Previous week">${ICON.back}</button><b>${short(PW)} to ${short(addDays(PW, 6))}</b><button class="icon" type="button" data-w="7" aria-label="Next week">${ICON.next}</button></div>
  <div class="sumrow"><div class="pill"><small>Week total</small><b>${usd(tot)}</b></div><div class="pill hot"><small>Still to pay</small><b>${usd(unpaid)}</b></div></div>
  <div class="list">${rows.map(({ s, r, pay }) => `<div class="pay"><span class="av" aria-hidden="true">${esc(s.name[0])}</span><button type="button" class="rl" data-h="${s.id}"><b>${esc(s.name)}${s.manager ? `<span class="mgr">+${usd(S.set.managerBonus)}</span>` : ''}</b><small>${r.hours ? `${r.hours} h at ${usd(s.rate)}` : `<u>Add hours</u> at ${usd(s.rate)}`}</small></button><span class="amt">${pay ? usd(pay) : ''}</span><button type="button" class="chk" role="checkbox" aria-checked="${!!r.paid}" aria-label="Paid: ${esc(s.name)}" data-p="${s.id}" ${pay ? '' : 'disabled'}>${ICON.check}</button></div>`).join('') || '<p class="empty">Add staff in Settings.</p>'}</div>
  ${payHistory()}<p class="note">Pay is rate times hours. The manager gets ${usd(S.set.managerBonus)} on top.</p>`;
};
function payHistory() {
  const weeks = [...new Set(S.payroll.map(p => p.week))].sort().reverse();
  if (!weeks.length) return '';
  return `<h2 class="sec">Past weeks<span class="secsum">${weeks.length} weeks on record</span></h2><div class="list hist" data-testid="payhist">${weeks.map(w => { const rs = S.payroll.filter(p => p.week === w), t = payWeekTotal(w), un = rs.filter(p => !p.paid && p.hours).length; return `<button type="button" class="row1 ${w === PW ? 'on' : ''}" data-week="${w}" aria-current="${w === PW}"><span><b>${short(w)} to ${short(addDays(w, 6))}</b><small>${rs.filter(p => p.hours).length} people${un ? `, ${un} not paid` : ''}</small></span><span class="amt">${usd(t)}</span></button>`; }).join('')}</div>`;
}
function payRec(sid) { const s = S.set.staff.find(x => x.id === sid) || payRows(PW).find(x => x.s.id === sid).s; const r = S.payroll.find(p => p.id === `${PW}|${sid}`) || { id: `${PW}|${sid}`, week: PW, staffId: sid, hours: 0, paid: false }; return { s, r }; }
async function savePay(s, r) { r.name = s.name; r.role = s.role; r.rate = s.rate; r.bonus = s.manager && r.hours ? +S.set.managerBonus || 0 : 0; r.pay = s.rate * (+r.hours || 0) + r.bonus; await save('payroll', r, 'Payroll'); }
MV.payrollW = () => {
  $$('[data-w]').forEach(b => b.onclick = () => { PW = addDays(PW, +b.dataset.w); render('money', ['payroll']); });
  $$('[data-week]').forEach(b => b.onclick = () => { PW = b.dataset.week; render('money', ['payroll']); scrollTo({ top: 0, behavior: 'smooth' }); });
  $$('[data-h]').forEach(b => b.onclick = () => { const { s, r } = payRec(b.dataset.h); padSheet({ title: s.name, sub: `Hours for ${short(PW)} to ${short(addDays(PW, 6))}`, label: 'Hours', money: false, value: r.hours || '', cta: 'Save hours', onSave: async n => { r.hours = n; await savePay(s, r); render('money', ['payroll']); } }); });
  $$('[data-p]').forEach(b => b.onclick = async () => { if (b.disabled) return; const { s, r } = payRec(b.dataset.p); r.paid = !r.paid; if (r.paid) stamp('Paid'); if (r.pay !== undefined && r.id && S.payroll.includes(r)) await save('payroll', r, 'Payroll'); else await savePay(s, r); setTimeout(() => render('money', ['payroll']), 250); });
};
MV.owed = () => {
  const debt = sum(S.debts, d => d.amount);
  return `<div class="sumrow"><div class="pill hot"><small>Owed to you</small><b>${usd(debt)}</b></div><button class="save sm" id="adddebt" type="button">${ICON.plus}Add</button></div>
  <div class="list">${S.debts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(d => `<button type="button" class="row1" data-debt="${esc(d.id)}"><span><b>${esc(d.who || null)}</b><small>${esc(d.note || '')}</small></span><span class="amt">${usd(d.amount)}</span></button>`).join('') || '<p class="empty">Nobody owes you money.</p>'}</div>`;
};
MV.owedW = () => {
  const debtSheet = d => { const isNew = !d; d = d || { id: 'd' + Date.now(), who: '', note: '', amount: '', date: bizDate() };
    padSheet({ title: isNew ? 'Add money owed' : 'Edit money owed', value: d.amount, extraTop: `<label class="l" for="dw">Who owes it</label><input class="txt" id="dw" value="${esc(d.who)}"><label class="l" for="dn">Note</label><input class="txt" id="dn" value="${esc(d.note)}">`,
      onSave: async (n, w) => { d.amount = n; d.who = w.querySelector('#dw').value.trim(); d.note = w.querySelector('#dn').value.trim(); await save('debts', d, null); render('money', ['owed']); },
      onDelete: isNew ? null : async () => { await DB.del('debts', d.id, null); await load(); render('money', ['owed']); } }); };
  $('#adddebt').onclick = () => debtSheet();
  $$('[data-debt]').forEach(b => b.onclick = () => debtSheet(S.debts.find(d => d.id === b.dataset.debt)));
};
