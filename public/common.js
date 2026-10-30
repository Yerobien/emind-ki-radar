// KI-Radar – gemeinsamer Client-Code (Matrix, Roadmap, Kennzahlen)
'use strict';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt1 = v => (v == null ? '–' : v.toFixed(1).replace('.', ','));
const fmtH = v => (v >= 10 ? Math.round(v) : String(Math.round(v * 10) / 10).replace('.', ','));
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};

// ---------- Tooltip ----------
let tipEl;
function tip(html, ev) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tooltip'; document.body.appendChild(tipEl); }
  if (!html) { tipEl.style.opacity = 0; return; }
  tipEl.innerHTML = html; tipEl.style.opacity = 1;
  const x = Math.min(ev.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8);
  const y = Math.min(ev.clientY + 14, window.innerHeight - tipEl.offsetHeight - 8);
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
function ideaTip(i) {
  return `<b>${esc(i.title)}</b><br>${esc(i.team)} · ${esc(i.quadrant)}<br>
    Nutzen Ø ${fmt1(i.nutzen)} · Aufwand Ø ${fmt1(i.aufwand)} · ${i.n} Bewertung${i.n === 1 ? '' : 'en'}<br>
    Potenzial ca. ${fmtH(i.hours)} h/Monat${i.metoo ? ` · ${i.metoo}× „betrifft mich auch“` : ''}${i.pilot ? ` · ${i.pilot}× Pilot-Interesse` : ''}`;
}

// ---------- Nutzen/Aufwand-Matrix (SVG) ----------
// x = Aufwand (links gering), y = Nutzen (oben hoch). Kreisgröße = Zeitpotenzial.
function renderMatrix(el, ideas, { labels = 8 } = {}) {
  const rated = ideas.filter(i => i.n && i.status !== 'Verworfen');
  const W = 600, H = 440, L = 44, R = 16, T = 34, B = 40;
  // Achse 0,6 bis 5,4, damit Punkte auf 1 bzw. 5 nicht am Rand abgeschnitten werden
  const sx = v => L + ((v - 0.6) / 4.8) * (W - L - R);
  const sy = v => T + ((5.4 - v) / 4.8) * (H - T - B);
  const maxH = Math.max(1, ...rated.map(i => i.hours));
  const rad = h => 6 + 16 * Math.sqrt(h / maxH);
  const mx = sx(3), my = sy(3);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="matrix" role="img" aria-label="Nutzen-Aufwand-Matrix">`;
  // Quadranten
  s += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" class="plot"/>`;
  s += `<rect x="${L}" y="${T}" width="${mx - L}" height="${my - T}" class="q q-win"/>`;
  s += `<line x1="${mx}" y1="${T}" x2="${mx}" y2="${H - B}" class="mid"/><line x1="${L}" y1="${my}" x2="${W - R}" y2="${my}" class="mid"/>`;
  s += `<text x="${L + 4}" y="${T - 10}" class="qlabel strong">Quick Wins → Jetzt</text>`;
  s += `<text x="${W - R - 4}" y="${T - 10}" class="qlabel" text-anchor="end">Großprojekte → Als Nächstes</text>`;
  s += `<text x="${L + 6}" y="${H - B - 6}" class="qlabel">Später: nebenbei</text>`;
  s += `<text x="${W - R - 6}" y="${H - B - 6}" class="qlabel" text-anchor="end">Lohnt eher nicht</text>`;
  // Achsen
  for (let v = 1; v <= 5; v++) {
    s += `<text x="${sx(v)}" y="${H - B + 18}" class="tick" text-anchor="middle">${v}</text>`;
    s += `<text x="${L - 10}" y="${sy(v) + 4}" class="tick" text-anchor="end">${v}</text>`;
  }
  s += `<text x="${(L + W - R) / 2}" y="${H - 4}" class="axis" text-anchor="middle">Aufwand →</text>`;
  s += `<text x="12" y="${(T + H - B) / 2}" class="axis" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">Nutzen →</text>`;
  // Punkte (große zuerst, damit kleine oben liegen)
  // Ideen mit (fast) gleicher Bewertung leicht versetzen, damit sie sich nicht verdecken
  const seen = {};
  const pos = {};
  for (const i of rated) {
    const k = Math.round(i.aufwand * 4) + ':' + Math.round(i.nutzen * 4), c = (seen[k] = (seen[k] || 0) + 1) - 1;
    const a = c * 2.4, d = c ? 0.16 + 0.05 * c : 0;
    pos[i.id] = [sx(i.aufwand + d * Math.cos(a)), sy(i.nutzen + d * Math.sin(a))];
  }
  const sorted = rated.slice().sort((a, b) => b.hours - a.hours);
  const labelled = new Set(sorted.slice(0, labels).map(i => i.id));
  for (const i of sorted) {
    const [x, y] = pos[i.id], r = rad(i.hours);
    s += `<circle cx="${x}" cy="${y}" r="${r}" class="dot ${i.status === 'Im Einsatz' ? 'done' : ''}" data-id="${esc(i.id)}"/>`;
  }
  for (const i of sorted) if (labelled.has(i.id)) {
    const [x, y] = pos[i.id], r = rad(i.hours);
    const t = i.title.length > 28 ? i.title.slice(0, 27) + '…' : i.title;
    const right = x < W - 200;
    s += `<text x="${right ? x + r + 4 : x - r - 4}" y="${y + 4}" class="dlabel" text-anchor="${right ? 'start' : 'end'}">${esc(t)}</text>`;
  }
  if (!rated.length) s += `<text x="${W / 2}" y="${H / 2}" class="axis" text-anchor="middle">Noch keine bewerteten Ideen</text>`;
  s += '</svg>';
  el.innerHTML = s;
  const byId = Object.fromEntries(rated.map(i => [i.id, i]));
  el.querySelectorAll('.dot').forEach(c => {
    c.addEventListener('mousemove', e => tip(ideaTip(byId[c.dataset.id]), e));
    c.addEventListener('mouseleave', () => tip(null));
  });
}

// ---------- Roadmap ----------
function renderRoadmap(el, ideas, { max = 6 } = {}) {
  const cols = ['Jetzt', 'Als Nächstes', 'Später', 'Im Einsatz'];
  el.innerHTML = cols.map(c => {
    const items = ideas.filter(i => i.lane === c).sort((a, b) => b.hours - a.hours || (b.nutzen || 0) - (a.nutzen || 0));
    const shown = items.slice(0, max);
    return `<div class="lane"><div class="lane-h"><span>${c}</span><span class="cnt">${items.length}</span></div>
      ${shown.map(i => `<div class="card-i" data-id="${esc(i.id)}">
        <div class="t">${esc(i.title)}</div>
        <div class="m">${esc(i.team)} · ${i.n ? `N ${fmt1(i.nutzen)} / A ${fmt1(i.aufwand)}` : 'unbewertet'} · ${fmtH(i.hours)} h/Mon.</div>
        ${i.owner || i.status !== 'Idee' ? `<div class="m">${i.status !== 'Idee' ? `<span class="chip">${esc(i.status)}</span>` : ''}${i.owner ? ` ${esc(i.owner)}` : ''}</div>` : ''}
      </div>`).join('')}
      ${items.length > max ? `<div class="more">+ ${items.length - max} weitere</div>` : ''}
      ${!items.length ? '<div class="more">–</div>' : ''}</div>`;
  }).join('');
  const byId = Object.fromEntries(ideas.map(i => [i.id, i]));
  el.querySelectorAll('.card-i').forEach(c => {
    c.addEventListener('mousemove', e => tip(ideaTip(byId[c.dataset.id]), e));
    c.addEventListener('mouseleave', () => tip(null));
  });
}

// ---------- Kennzahlen + Verteilungen ----------
function renderKpis(el, st) {
  el.innerHTML = [
    ['Teilnehmende', st.people], ['Ideen', st.ideas], ['Bewertungen', st.votes], ['Zeitpotenzial', `${st.hours} h/Monat`],
  ].map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
}
function renderBars(el, title, order, counts) {
  const max = Math.max(1, ...order.map(k => counts[k] || 0));
  el.innerHTML = `<h3>${esc(title)}</h3>` + order.map(k => {
    const n = counts[k] || 0;
    return `<div class="bar-row" title="${esc(k)}: ${n}"><span class="bl">${esc(k)}</span>
      <span class="bt"><i style="width:${(100 * n) / max}%"></i></span><span class="bn">${n}</span></div>`;
  }).join('');
}
