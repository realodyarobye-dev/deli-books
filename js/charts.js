/* Small SVG charts: sparkline and smooth area chart with gradient fill. No library. */
let CHART_ID = 0;
const kfmt = v => v >= 1000 ? '$' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : '$' + Math.round(v);
// Smooth path through points (Catmull-Rom converted to cubic Bezier).
function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t], c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function spark(vals, { w = 96, h = 32, up = true } = {}) {
  const id = 'sg' + (++CHART_ID), mx = Math.max(...vals, 1), mn = Math.min(...vals, 0), n = Math.max(vals.length - 1, 1);
  const pts = vals.map((v, i) => [i / n * w, h - 2 - (v - mn) / (mx - mn || 1) * (h - 4)]), line = smooth(pts);
  const col = up ? 'var(--pos)' : 'var(--neg)';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${line} L${w},${h} L0,${h}Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}
/* Area chart. series: [{vals, cls:'main'|'prev'}], labels: x labels. Text is HTML so it never stretches. */
function niceTop(mx) { const p = Math.pow(10, Math.floor(Math.log10(mx / 4 || 1))); for (const m of [1, 2, 2.5, 5, 10, 20]) { const step = m * p, n = Math.ceil(mx * 1.05 / step); if (n <= 5) return { step, n: Math.max(n, 2), top: step * Math.max(n, 2) }; } return { step: mx / 4, n: 4, top: mx }; }
function area({ series, labels, label, h = 220 }) {
  const id = 'ag' + (++CHART_ID), W = 600, H = 200, n = Math.max(labels.length - 1, 1);
  const { step, top, n: tk } = niceTop(Math.max(...series.flatMap(s => s.vals), 1));
  const x = i => i / n * W, y = v => 4 + (1 - v / top) * (H - 8);
  const ticks = [...Array(tk + 1).keys()], grid = ticks.map(k => `<line x1="0" x2="${W}" y1="${y(step * k)}" y2="${y(step * k)}"/>`).join('');
  const paths = series.map(s => { const d = smooth(s.vals.map((v, i) => [x(i), y(v)])); return (s.cls === 'main' ? `<path class="fill" d="${d} L${x(s.vals.length - 1)},${y(0)} L0,${y(0)}Z" fill="url(#${id})"/>` : '') + `<path class="ln ${s.cls}" d="${d}" pathLength="1"/>`; }).join('');
  const main = series[0], last = main.vals.length - 1, every = Math.ceil(labels.length / 6);
  const hits = main.vals.map((v, i) => `<span class="hit" style="left:${(i - .5) / n * 100}%;width:${100 / n}%" title="${esc(labels[i])}: ${usd0(v)}${series[1] ? `, before ${usd0(series[1].vals[i] || 0)}` : ''}"></span>`).join('');
  return `<div class="areaw" role="img" aria-label="${esc(label)}" style="--h:${h}px"><div class="yax">${ticks.slice().reverse().map(k => `<span style="top:${y(step * k) / H * 100}%">${kfmt(step * k)}</span>`).join('')}</div>
  <div class="plot"><svg class="area" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".26"/><stop offset="1" stop-color="var(--acc)" stop-opacity="0"/></linearGradient></defs><g class="gl">${grid}</g>${paths}</svg>
  <i class="dot" style="left:100%;top:${y(main.vals[last]) / H * 100}%"></i>${hits}</div>
  <div class="xax">${labels.map((l, i) => (i % every === 0 && last - i >= every * .6) || i === last ? `<span style="left:${i / n * 100}%">${esc(l)}</span>` : '').join('')}</div></div>`;
}
// Delta pill: green up, red down.
const delta = (p, suffix = '') => p === null || !isFinite(p) ? '<span class="pillx">No compare</span>' : `<span class="pillx ${p >= 0 ? 'pos' : 'neg'}">${p >= 0 ? '↑' : '↓'} ${Math.abs(p).toFixed(1)}%${suffix}</span>`;
