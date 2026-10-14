/* Close-out reminders at each shift's end (Settings > Shift times; defaults 2 PM, 7 PM, 6 AM).
   Honest limits: with no push server, these only fire while the app is open or still alive in the background.
   On iPhone that means open or very recently used. The in-app banner on Home always shows what is due. */
const Notify = (() => {
  let timer = null;
  const sent = () => { try { return JSON.parse(localStorage.getItem('deli-notified') || '[]'); } catch { return []; } };
  const mark = k => { const s = sent().slice(-30); s.push(k); localStorage.setItem('deli-notified', JSON.stringify(s)); };
  const supported = () => 'Notification' in window;
  const state = () => !supported() ? 'unsupported' : Notification.permission;
  async function ask() {
    if (!supported()) { toast('This browser cannot show notifications. On iPhone, add Deli Books to the Home Screen first.'); return 'unsupported'; }
    const r = await Notification.requestPermission();
    S.set.notify = r === 'granted'; await save('settings', S.set); schedule(); return r;
  }
  // Next reminder time after `now`.
  function nextAt(now = new Date()) {
    const c = SHIFTS.map(s => tmin(s.end)).map(n => { const d = new Date(now); d.setHours(Math.floor(n / 60), n % 60, 5, 0); if (d <= now) d.setDate(d.getDate() + 1); return d; });
    return c.sort((a, b) => a - b)[0];
  }
  async function show(title, body, url, tag) {
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg) return reg.showNotification(title, { body, tag, data: { url }, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
      const n = new Notification(title, { body, tag }); n.onclick = () => { focus(); location.hash = url.slice(1); };
    } catch (e) { console.warn(e); }
  }
  // Fire for shifts that just ended (within 3 hours) and are not entered yet. Each one only once.
  function check(now = new Date()) {
    const due = dueShifts(now).filter(d => now - d.end < 3 * 36e5 && !sent().includes(`${d.date}|${d.k}`));
    if (S.set?.notify && state() === 'granted') for (const d of due) { mark(`${d.date}|${d.k}`); Notify._show(`${d.k} close-out is due`, `Enter card, cash and paid out for ${d.date === bizDate(now) ? 'today' : nice(d.date)}.`, `#entry/${d.k}/${d.date}`, `close-${d.date}-${d.k}`); }
    if (ROUTE === 'home' && !Keys.depth() && !document.getElementById('lock') && !!$('.banner') !== !!dueShifts().length) go();
    return due;
  }
  function schedule() { clearTimeout(timer); const at = nextAt(); timer = setTimeout(() => { check(); schedule(); }, Math.min(at - new Date(), 2 ** 31 - 1)); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); schedule(); } });
  // Tapping a notification: the service worker focuses this window and sends the link.
  navigator.serviceWorker?.addEventListener?.('message', e => { if (e.data?.type === 'open' && e.data.url) location.hash = e.data.url.replace(/^.*#/, ''); });
  return { ask, state, check, schedule, nextAt, _show: show };
})();
