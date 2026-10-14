/* Start up. */
Sync.on(paintSync);
// Rows from other devices landed: reload state, apply pulled shift times, and redraw the screen
// (skipped while a sheet, the PIN lock, or a text field is in use so nothing is yanked mid-edit).
Sync.onMerge(async () => {
  await load();
  const st = S.set, times = { ...(st?.shiftTimes || {}) }; let fix = false;
  for (const r of await DB.all('settings')) if (/^shift-/.test(r.id) && /^\d\d:\d\d$/.test(r.start || '') && times[r.shift] !== r.start) { times[r.shift] = r.start; fix = true; }
  if (st && fix) { st.shiftTimes = times; await DB.put('settings', st); await load(); }
  const a = document.activeElement;
  if (document.querySelector('.sheetwrap') || document.getElementById('lock') || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  const y = scrollY; go(); scrollTo(0, y);
});
addEventListener('hashchange', go);
(async function start() {
  const splash = $('#splash'), t0 = Date.now();
  try { LOGO = await (await fetch('logo.svg')).text(); LOGO = LOGO.replace(/<\?xml[^>]*>/, '').replace(/<title>.*?<\/title>/, ''); } catch { }
  splash.querySelector('.lg').innerHTML = LOGO;
  if (navigator.storage?.persist) { try { await navigator.storage.persist(); } catch { } }
  await DB.open(); await seed(); await load(); PIN = await DB.get('settings', 'pin');
  if (PIN) lockNow();
  go(); Sync.run(); Notify.check(); Notify.schedule();
  setTimeout(() => splash.classList.add('out'), Math.max(0, 900 - (Date.now() - t0)));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
})();
