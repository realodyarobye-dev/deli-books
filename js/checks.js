/* Checks: history with filters (status, vendor, month, search). */
const CF = { st: 'out', vendor: '', month: '', q: '', lim: 60 };
function checkMatch(c) {
  if (CF.st === 'out' && c.cleared) return false;
  if (CF.st === 'cleared' && !c.cleared) return false;
  if (CF.vendor && c.vendor !== CF.vendor) return false;
  if (CF.month && (c.date || '').slice(0, 7) !== CF.month) return false;
  const q = CF.q.trim().toLowerCase();
  return !q || `${c.num} ${c.vendor} ${c.amount}`.toLowerCase().includes(q);
}
function checkRow(c, today) {
  const age = c.date ? daysBetween(c.date, today) : 0;
  return `<div class="row ${c.cleared ? 'done' : ''}"><button type="button" class="rl" data-edit="${esc(c.id)}"><b>${esc(c.vendor)}</b><small>#${esc(c.num)}${c.date ? `, written ${short(c.date)}${c.dateEstimated ? ' (about)' : ''}` : ''}${!c.cleared && age > 10 ? `<em class="old">${age} days out</em>` : ''}</small></button><span class="amt">${usd(c.amount)}</span><button type="button" class="chk" role="checkbox" aria-checked="${!!c.cleared}" aria-label="Cleared: ${esc(c.vendor)} #${esc(c.num)}" data-n="${esc(c.id)}">${ICON.check}</button></div>`;
}
function checkList() {
  const today = bizDate();
  const hits = S.checks.filter(checkMatch).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (parseInt(b.num) || 0) - (parseInt(a.num) || 0));
  const shown = hits.slice(0, CF.lim); let html = '', cur = null;
  for (const c of shown) { const m = (c.date || '').slice(0, 7) || 'none'; if (m !== cur) { if (cur) html += '</div>'; cur = m; const ms = hits.filter(x => ((x.date || '').slice(0, 7) || 'none') === m); html += `<h2 class="sec">${m === 'none' ? 'No date' : monthName(m)}<span class="secsum">${ms.length} checks, ${usd(sum(ms, x => x.amount))}</span></h2><div class="list">`; } html += checkRow(c, today); }
  if (cur) html += '</div>';
  return `<p class="fcount" role="status" data-testid="chkcount">${hits.length} ${hits.length === 1 ? 'check' : 'checks'}, ${usd(sum(hits, x => x.amount))}</p>${html || `<p class="empty">${CF.st === 'out' && !CF.q && !CF.vendor && !CF.month ? 'Every check has cleared.' : 'No checks match.'}</p>`}${hits.length > CF.lim ? `<button type="button" class="ghost more" id="chkmore">Show more (${hits.length - CF.lim} left)</button>` : ''}`;
}
MV.checks = () => {
  const vendors = [...new Set(S.checks.map(c => c.vendor))].sort((a, b) => a.localeCompare(b));
  const months = [...new Set(S.checks.map(c => (c.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const op = openChecks();
  return `<div class="sumrow"><div class="pill hot"><small>Still out</small><b>${usd(floatAmt())}</b></div><div class="pill"><small>Not cleared</small><b>${op.length}</b></div><button class="save sm" id="add" type="button">${ICON.plus}Write a check</button></div>
  <div class="filters" role="search" aria-label="Filter checks">
    <div class="seg sm" role="radiogroup" aria-label="Status">${[['out', 'Outstanding'], ['cleared', 'Cleared'], ['all', 'All']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${CF.st === k}" data-st="${k}">${l}</button>`).join('')}</div>
    <label class="sr" for="fven">Vendor</label><select id="fven" class="txt sel"><option value="">All vendors</option>${vendors.map(v => `<option ${v === CF.vendor ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
    <label class="sr" for="fmon">Month</label><select id="fmon" class="txt sel"><option value="">All months</option>${months.map(m => `<option value="${m}" ${m === CF.month ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select>
    <label class="sr" for="fq">Search checks</label><input id="fq" class="txt" type="search" placeholder="Number, vendor or amount" value="${esc(CF.q)}" autocomplete="off">
  </div>
  <div id="chklist">${checkList()}</div><p class="note">Tick the box when a check clears the bank. Tap the name to fix it.</p>`;
};
// Check number and amount are two separate pad fields. Only the highlighted one takes typing.
function checkSheet(c) {
  const isNew = !c, nums = S.checks.map(x => parseInt(x.num) || 0);
  c = c || { num: nums.length ? String(Math.max(...nums) + 1) : '', vendor: '', amount: '', date: bizDate(), cleared: false };
  const top = [...new Set([...S.checks.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(x => x.vendor), ...S.set.vendors.map(v => v.name)])].slice(0, 10);
  padSheet({ title: isNew ? 'New check' : `Check #${c.num}`, cta: isNew ? 'Add check' : 'Save check', order: ['num', 'amt'], active: isNew && c.num ? 'amt' : 'num',
    fields: { num: { label: 'Check number', v: String(c.num || ''), int: true, money: false, ph: 'Tap to type' }, amt: { label: 'Amount', v: c.amount ? String(c.amount) : '' } },
    extra: `<label class="l" for="cven">Vendor</label><input class="txt" id="cven" autocomplete="off" value="${esc(c.vendor)}" placeholder="Vendor name…"><div class="chips">${top.map(v => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === c.vendor}">${esc(v)}</button>`).join('')}</div>`,
    wire: w => w.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { w.querySelector('#cven').value = b.dataset.v; w.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-pressed', x === b)); }),
    onSave: async (v, w) => {
      const num = String(v.num).trim(), vendor = w.querySelector('#cven').value.trim(), n = v.amt;
      if (!num || !vendor || !n) { toast('Add the check number, vendor and amount'); return false; }
      // Old books reuse numbers, so only a check that is still out blocks a duplicate.
      if (S.checks.some(x => x.num === num && x.id !== c.id && !x.cleared)) { toast(`Check #${num} is already waiting to clear`); return false; }
      let id = c.id;
      if (!id) { id = 'chk-' + num; let i = 2; while (S.checks.some(x => x.id === id)) id = `chk-${num}-${i++}`; }
      await save('checks', { ...c, id, num, vendor, amount: n }, 'Checks'); stamp('Saved'); go();
    },
    onDelete: isNew ? null : async () => { await DB.del('checks', c.id, 'Checks'); await load(); Sync.run(); go(); } });
}
function wireCheckRows() {
  $$('[data-edit]').forEach(b => b.onclick = () => checkSheet(S.checks.find(c => c.id === b.dataset.edit)));
  $$('.chk[data-n]').forEach(b => b.onclick = async () => { const c = S.checks.find(x => x.id === b.dataset.n); c.cleared = !c.cleared; c.clearedAt = c.cleared ? bizDate() : ''; b.setAttribute('aria-checked', c.cleared); if (c.cleared) stamp('Cleared'); await save('checks', c, 'Checks'); setTimeout(go, 300); });
  const m = $('#chkmore'); if (m) m.onclick = () => { CF.lim += 100; relist(); };
}
function relist() { $('#chklist').innerHTML = checkList(); wireCheckRows(); }
MV.checksW = () => {
  $('#add').onclick = () => checkSheet();
  $$('[data-st]').forEach(b => b.onclick = () => { CF.st = b.dataset.st; CF.lim = 60; $$('[data-st]').forEach(x => x.setAttribute('aria-checked', x === b)); relist(); });
  $('#fven').onchange = e => { CF.vendor = e.target.value; CF.lim = 60; relist(); };
  $('#fmon').onchange = e => { CF.month = e.target.value; CF.lim = 60; relist(); };
  $('#fq').oninput = e => { CF.q = e.target.value; CF.lim = 60; relist(); };
  wireCheckRows();
};
