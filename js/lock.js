/* PIN lock (blocks casual access; it is not encryption). Salted PBKDF2, never the PIN itself. */
const b64 = u8 => btoa(String.fromCharCode(...u8)), unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
const PIN_ITER = 150000;
async function pinHash(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITER }, key, 256)));
}
async function setPin(pin) { const salt = crypto.getRandomValues(new Uint8Array(16)); await DB.put('settings', { id: 'pin', salt: b64(salt), hash: await pinHash(pin, salt), iter: PIN_ITER }); PIN = await DB.get('settings', 'pin'); }
async function checkPin(pin) { if (!PIN) return true; const h = await pinHash(pin, unb64(PIN.salt)); let d = h.length ^ PIN.hash.length; for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ PIN.hash.charCodeAt(i); return d === 0; }
let PIN = null, locked = false, hiddenAt = 0, tries = 0;
function pinScreen(mode, done) {
  document.getElementById('lock')?.remove();
  const el = document.createElement('div'); el.id = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'lt');
  app.setAttribute('aria-hidden', 'true'); app.style.visibility = 'hidden';
  let step = mode === 'unlock' ? 'unlock' : mode === 'change' ? 'old' : 'new', v = '', first = '';
  const title = () => ({ unlock: 'Enter your PIN', old: 'Enter your current PIN', new: mode === 'create' ? 'Create a PIN' : 'Choose a new PIN', again: 'Type the PIN again' }[step]);
  const hint = () => ({ unlock: 'Deli Books is locked', old: 'To change your PIN', new: '4 to 6 numbers. You type it each time you open the app.', again: 'To make sure it is right' }[step]);
  el.innerHTML = `<div class="lockin">${logo('lk')}<h1 id="lt"></h1><p class="sub" id="lh" aria-live="polite"></p><div class="dots" id="ld" aria-hidden="true"></div>
    <div class="pad pinpad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'OK'].map(k => `<button type="button" data-pk="${k}" aria-label="${k === 'del' ? 'Delete' : k === 'OK' ? 'Done' : k}" class="${k === 'OK' ? 'okk' : ''}">${k === 'del' ? '⌫' : k}</button>`).join('')}</div>
    ${mode === 'unlock' ? '<button class="lnk" id="forgot" type="button">Forgot PIN</button>' : mode === 'change' ? '<button class="lnk" id="pincancel" type="button">Cancel</button>' : ''}</div>`;
  document.body.append(el);
  const paint = msg => { el.querySelector('#lt').textContent = title(); el.querySelector('#lh').textContent = msg || hint(); el.querySelector('#ld').innerHTML = [...Array(Math.max(4, v.length))].map((_, i) => `<i class="${i < v.length ? 'on' : ''}"></i>`).join(''); };
  const shake = msg => { v = ''; paint(msg); el.querySelector('#ld').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }], { duration: 280 }); navigator.vibrate?.([30, 40, 30]); };
  const finish = () => { el.remove(); Keys.setLock(null); app.removeAttribute('aria-hidden'); app.style.visibility = ''; done?.(); };
  const submit = async () => {
    if (v.length < 4) return shake('Use at least 4 numbers');
    if (step === 'unlock' || step === 'old') {
      if (await checkPin(v)) { tries = 0; if (step === 'unlock') { locked = false; return finish(); } step = 'new'; v = ''; return paint(); }
      tries++; await new Promise(r => setTimeout(r, Math.min(8000, 400 * 2 ** Math.max(0, tries - 3))));
      return shake(`Wrong PIN. Try again.${tries >= 3 ? ` (${tries} tries)` : ''}`);
    }
    if (step === 'new') { first = v; v = ''; step = 'again'; return paint(); }
    if (step === 'again') { if (v !== first) { step = 'new'; return shake('The two PINs did not match. Start again.'); } await setPin(v); locked = false; stamp('PIN set'); return finish(); }
  };
  const press = k => { if (k === 'del') v = v.slice(0, -1); else if (k === 'OK') return submit(); else if (v.length < 6) v += k; paint(); };
  // The lock is the top key layer while it is open, so nothing behind it gets keys.
  Keys.setLock({ key: e => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter') { e.preventDefault(); press('OK'); } }, onEsc: () => { } });
  el.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => press(b.dataset.pk));
  el.querySelector('#pincancel')?.addEventListener('click', finish);
  el.querySelector('#forgot')?.addEventListener('click', async () => {
    const synced = !!S.sync?.url;
    if (!confirm(`Forgot your PIN? The only way in is to ERASE everything stored in Deli Books on this device.\n\n${synced ? 'Your Google Sheet keeps a copy of what was already sent, but anything still waiting to send will be lost.' : 'Google Sheets is not connected, so this data exists nowhere else and will be gone for good.'}`)) return;
    if ((prompt('Type ERASE to delete all Deli Books data on this device') || '').trim() !== 'ERASE') return toast('Nothing was erased');
    await new Promise(r => { const d = indexedDB.deleteDatabase('ny-deli-books'); d.onsuccess = d.onerror = d.onblocked = r; setTimeout(r, 1500); });
    location.replace(location.pathname);
  });
  paint();
}
function lockNow() { if (!PIN || document.getElementById('lock')) return; locked = true; pinScreen('unlock'); }
document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else if (PIN && hiddenAt && Date.now() - hiddenAt > 120000) lockNow(); });
