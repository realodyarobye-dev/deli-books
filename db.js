// Tiny IndexedDB layer. Every write commits the record AND its Sheets outbox entry in one transaction.
const DB = (() => {
  const STORES = ['shifts','checks','bank','payroll','orders','settings','debts','delivery','outbox']; // 'orders' kept so v1 data is not lost; v2 does not use it
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('ny-deli-books', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of STORES) if (!d.objectStoreNames.contains(s))
          d.createObjectStore(s, s === 'outbox' ? { keyPath: 'seq', autoIncrement: true } : { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });
  async function all(store) {
    const d = await open();
    return new Promise((res, rej) => { const q = d.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function get(store, id) {
    const d = await open();
    return new Promise((res, rej) => { const q = d.transaction(store).objectStore(store).get(id); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  // tab: Google Sheet tab name, or null for local-only data
  async function put(store, rec, tab) {
    const d = await open();
    rec.updatedAt = new Date().toISOString();
    const stores = tab ? [store, 'outbox'] : [store];
    const tx = d.transaction(stores, 'readwrite', { durability: 'strict' });
    tx.objectStore(store).put(rec);
    if (tab) tx.objectStore('outbox').add({ tab, key: rec.id, row: rec, at: rec.updatedAt });
    await done(tx);
    return rec;
  }
  // Many records in one transaction (used by the starting-data import).
  async function putMany(store, recs, tab) {
    const d = await open(), at = new Date().toISOString();
    const tx = d.transaction(tab ? [store, 'outbox'] : [store], 'readwrite');
    for (const rec of recs) { rec.updatedAt = at; tx.objectStore(store).put(rec); if (tab) tx.objectStore('outbox').add({ tab, key: rec.id, row: rec, at }); }
    await done(tx);
  }
  async function del(store, id, tab) {
    const d = await open();
    const tx = d.transaction(tab ? [store, 'outbox'] : [store], 'readwrite', { durability: 'strict' });
    tx.objectStore(store).delete(id);
    if (tab) tx.objectStore('outbox').add({ tab, key: id, row: null, del: true, at: new Date().toISOString() });
    await done(tx);
  }
  async function clearOutbox(seqs) {
    const d = await open();
    const tx = d.transaction('outbox', 'readwrite');
    seqs.forEach(s => tx.objectStore('outbox').delete(s));
    await done(tx);
  }
  // Merge rows pulled from the sheet: last write wins on updatedAt, tombstones delete, and a record with
  // an unsent local edit in the outbox is never touched. One transaction with the outbox, so a save
  // racing the pull cannot slip between the check and the write. Nothing here is queued for sending.
  async function merge(items) {
    const d = await open(), stores = [...new Set(items.map(i => i.store)), 'outbox'];
    const tx = d.transaction(stores, 'readwrite', { durability: 'strict' });
    let changed = 0;
    const q = tx.objectStore('outbox').getAll();
    q.onsuccess = () => {
      const pending = new Set(q.result.map(o => o.tab + '|' + o.key));
      for (const it of items) {
        if (pending.has(it.tab + '|' + it.id)) continue;
        const os = tx.objectStore(it.store), g = os.get(it.id);
        g.onsuccess = () => {
          const cur = g.result, mine = (cur && cur.updatedAt) || '';
          if (cur && mine >= (it.updatedAt || '')) return;
          if (it.del) { if (cur) { os.delete(it.id); changed++; } }
          else { os.put(it.rec); changed++; }
        };
      }
    };
    await done(tx);
    return changed;
  }
  return { open, all, get, put, putMany, del, clearOutbox, merge };
})();
