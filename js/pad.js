/* Number pads and keyboard routing.
   v1 bug: a page-wide keydown listener fed every digit to the amount, so typing a check number also typed into the amount.
   v2 rule: every pad belongs to one layer (the screen, a sheet, or the PIN lock). Only the top layer gets keys,
   only its active field changes, and keys typed into a real text box are never touched. */
const Keys = (() => {
  let screen = null, lock = null; const sheets = [];
  const top = () => lock || sheets[sheets.length - 1] || screen;
  const isText = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const L = top(); if (!L) return;
    if (e.key === 'Escape') { L.onEsc?.(); return; }
    if (isText(e.target)) return;
    L.key?.(e);
  });
  return {
    setScreen: p => { screen = p; }, clearScreen: () => { screen = null; },
    push: s => sheets.push(s), pop: s => { const i = sheets.indexOf(s); if (i >= 0) sheets.splice(i, 1); },
    setLock: l => { lock = l; }, top, depth: () => sheets.length
  };
})();
const PADKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
const padHtml = (noDot) => `<div class="pad" role="group" aria-label="Number pad">${PADKEYS.map(k => k === '.' && noDot ? '<span></span>' : `<button type="button" data-k="${k}" aria-label="${k === 'del' ? 'Delete' : k === '.' ? 'Point' : k}">${k === 'del' ? '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M9 6h11v12H9l-6-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' : k}</button>`).join('')}</div>`;
// A field button. f: {label, sub, money, int}
const fieldHtml = (key, f) => `<button type="button" class="field" data-f="${key}" aria-pressed="false"><span class="k">${esc(f.label)}${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</span><span class="v"></span></button>`;
/* Make a pad. o: { root, fields: {key: {label, v, money=true, int=false, max=7}}, order:[keys], active, onChange, onEnter, onEsc, layer:'screen'|'sheet' } */
function Pad(o) {
  const p = { root: o.root, f: o.fields, order: o.order || Object.keys(o.fields), active: o.active || (o.order || Object.keys(o.fields))[0] };
  const show = f => f.money === false ? typed(f.v) || '0' : '$' + typed(f.v);
  p.paint = () => {
    for (const k of p.order) {
      const b = p.root.querySelector(`[data-f="${k}"]`); if (!b) continue; const f = p.f[k];
      b.setAttribute('aria-pressed', k === p.active); b.classList.toggle('on', k === p.active);
      const v = b.querySelector('.v'); v.textContent = f.int ? (f.v || '') || (f.ph || '0') : show(f); v.classList.toggle('zero', !f.v);
    }
    o.onChange?.(p);
  };
  p.val = k => parseFloat(p.f[k].v || '0') || 0;
  p.str = k => p.f[k].v || '';
  p.focus = k => { p.active = k; p.paint(); };
  p.press = k => {
    const f = p.f[p.active]; let v = f.v || ''; const max = f.max || 7;
    if (k === 'del') v = v.slice(0, -1);
    else if (k === '.') { if (f.int) return; if (!v.includes('.')) v = (v || '0') + '.'; }
    else if (f.int) { if (v.length < (f.max || 8)) v += k; }
    else if (!(v.includes('.') && v.split('.')[1].length >= 2) && v.replace('.', '').length < max) v = v === '0' ? k : v + k;
    f.v = v; p.paint();
  };
  p.key = e => {
    if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); p.press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); p.press('del'); }
    else if (e.key === 'Tab' && p.order.length > 1 && e.target.closest?.('[data-f]') ) { e.preventDefault(); const i = p.order.indexOf(p.active); p.focus(p.order[(i + (e.shiftKey ? p.order.length - 1 : 1)) % p.order.length]); p.root.querySelector(`[data-f="${p.active}"]`)?.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (p.order.length < 2) return; e.preventDefault(); const i = p.order.indexOf(p.active); p.focus(p.order[(i + (e.key === 'ArrowUp' ? p.order.length - 1 : 1)) % p.order.length]); }
    else if (e.key === 'Enter' && !e.target.closest?.('button:not([data-f]):not([data-k])')) { e.preventDefault(); o.onEnter?.(); }
  };
  p.onEsc = o.onEsc;
  p.root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => p.press(b.dataset.k));
  p.root.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => p.focus(b.dataset.f)));
  if (o.layer === 'screen') Keys.setScreen(p);
  p.paint();
  return p;
}

/* Sheets: modal panels. Each one is its own key layer. */
function openSheet({ label, html, cls }) {
  const wrap = document.createElement('div'); wrap.className = 'sheetwrap';
  const prev = document.activeElement;
  wrap.innerHTML = `<div class="scrim" data-x></div><div class="sheet ${cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1"><div class="grab" aria-hidden="true"></div><button type="button" class="icon x" data-x aria-label="Close">${ICON.x}</button>${html}</div>`;
  document.body.append(wrap);
  const layer = { onEsc: () => close(), key: null };
  const close = () => { Keys.pop(layer); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 180); prev?.focus?.({ preventScroll: true }); };
  wrap.querySelectorAll('[data-x]').forEach(b => b.onclick = close);
  wrap.addEventListener('keydown', e => { if (e.key !== 'Tab') return; const f = [...wrap.querySelectorAll('button,input,select,a[href]')].filter(x => !x.disabled && x.offsetParent); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } });
  Keys.push(layer);
  return { wrap, el: wrap.querySelector('.sheet'), close, layer };
}
/* Number pad sheet. o: {title, sub, fields?, value, label, money, int, extraTop, extra, cta, onSave(values, wrap) -> false keeps open, onDelete, wire} */
function padSheet(o) {
  const fields = o.fields || { amt: { label: o.label || 'Amount', v: o.value ? String(o.value) : '', money: o.money, int: o.int } };
  const order = o.order || Object.keys(fields);
  const s = openSheet({ label: o.title, cls: 'padsheet', html: `<h3>${esc(o.title)}</h3>${o.sub ? `<p class="sub">${esc(o.sub)}</p>` : ''}${o.extraTop || ''}
    <div class="fields">${order.map(k => fieldHtml(k, fields[k])).join('')}</div>${o.extra || ''}${padHtml(order.every(k => fields[k].int || fields[k].money === false && o.noDot))}
    <div class="acts"><button class="save" data-ok type="button">${esc(o.cta || 'Save')}</button>${o.onDelete ? '<button class="save ghost" data-del type="button">Delete</button>' : ''}</div>` });
  const ok = async () => { const vals = Object.fromEntries(order.map(k => [k, fields[k].int ? (fields[k].v || '') : parseFloat(fields[k].v || '0') || 0])); const r = await o.onSave(o.fields ? vals : vals.amt, s.wrap); if (r !== false) s.close(); };
  const p = Pad({ root: s.el, fields, order, active: o.active, onEnter: ok, onEsc: s.close });
  s.layer.key = p.key; s.layer.pad = p;
  s.el.querySelector('[data-ok]').onclick = ok;
  if (o.onDelete) s.el.querySelector('[data-del]').onclick = async () => { if (!confirm('Delete this for good?')) return; await o.onDelete(); s.close(); };
  o.wire?.(s.el, p);
  s.el.querySelector(`[data-f="${p.active}"]`)?.focus({ preventScroll: true });
  return { ...s, pad: p };
}
