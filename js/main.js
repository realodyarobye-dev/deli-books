/* Start up. */
Sync.on(paintSync);
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
