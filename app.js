(() => {
'use strict';

const KEY = 'punktezettel-v1';
const GAMES = {
  skyjo: { name: 'Skyjo', limit: 100, win: 'low',  rule: 'Wenigste Punkte gewinnt. Wer 100 Punkte erreicht, beendet das Spiel.' },
  flip7: { name: 'Flip 7', limit: 200, win: 'high', rule: 'Meiste Punkte gewinnt. Wer 200 Punkte erreicht, beendet das Spiel.' }
};

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/* ---------- Zustand ---------- */
function blankStats() { return { skyjo: { w: 0, l: 0 }, flip7: { w: 0, l: 0 } }; }
function normalize(d) {
  const s = { players: [], games: { skyjo: null, flip7: null }, theme: 'light' };
  if (!d || typeof d !== 'object') return s;
  if (Array.isArray(d.players)) {
    s.players = d.players.filter(p => p && p.id && p.name).map(p => ({
      id: String(p.id), name: String(p.name),
      stats: {
        skyjo: { w: +(p.stats?.skyjo?.w) || 0, l: +(p.stats?.skyjo?.l) || 0 },
        flip7: { w: +(p.stats?.flip7?.w) || 0, l: +(p.stats?.flip7?.l) || 0 }
      }
    }));
  }
  for (const t of Object.keys(GAMES)) {
    const g = d.games?.[t];
    if (g && Array.isArray(g.players) && Array.isArray(g.rounds)) s.games[t] = g;
  }
  if (d.theme === 'dark' || d.theme === 'light') s.theme = d.theme;
  return s;
}
let state;
try {
  const raw = localStorage.getItem(KEY);
  state = normalize(raw ? JSON.parse(raw) : null);
  if (!raw) state.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} catch (e) { state = normalize(null); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

let view = 'home';
let selected = new Set();

const player = id => state.players.find(p => p.id === id);
function addPlayer(name) {
  name = (name || '').trim();
  if (!name) return null;
  const ex = state.players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (ex) return ex;
  const p = { id: uid(), name, stats: blankStats() };
  state.players.push(p);
  save();
  return p;
}

/* ---------- Spiellogik ---------- */
const totals = g => g.players.map((_, i) => g.rounds.reduce((s, r) => s + (Number(r[i]) || 0), 0));
function winnerIdx(type, t) {
  const target = GAMES[type].win === 'low' ? Math.min(...t) : Math.max(...t);
  return t.map((v, i) => v === target ? i : -1).filter(i => i >= 0);
}
function checkEnd(type) {
  const g = state.games[type];
  if (!g || g.finished) return false;
  if (!totals(g).some(v => v >= GAMES[type].limit)) return false;
  return finishGame(type);
}
function finishGame(type) {
  const g = state.games[type];
  if (!g || g.finished) return false;
  const t = totals(g);
  const w = winnerIdx(type, t);
  g.finished = true;
  g.winners = w.map(i => g.players[i]);
  g.final = t;
  g.players.forEach((id, i) => {
    const p = player(id);
    if (!p) return;
    if (w.includes(i)) p.stats[type].w++; else p.stats[type].l++;
  });
  save();
  render();
  confetti();
  return true;
}

/* ---------- Rendering ---------- */
function setTheme() { document.documentElement.dataset.theme = state.theme; }
function render() {
  setTheme();
  const base = view.startsWith('game:') ? view.slice(5) : view;
  document.body.dataset.view = base;
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === (GAMES[base] ? 'home' : base)));
  const el = $('#view');
  let html = '';
  if (base === 'home') html = homeHTML();
  else if (base === 'stats') html = statsHTML();
  else if (base === 'settings') html = settingsHTML();
  else if (GAMES[base]) html = gameHTML(base);
  el.innerHTML = `<div class="page">${html}</div>`;
}

function playersCard(title) {
  const chips = state.players.length
    ? `<div class="chips">${state.players.map(p => `<span class="chip">${esc(p.name)}<button class="x" data-act="delplayer" data-id="${p.id}" aria-label="${esc(p.name)} entfernen">×</button></span>`).join('')}</div>`
    : `<div class="empty">Noch keine Personen. Trag unten den ersten Namen ein.</div><div style="height:12px"></div>`;
  return `<div class="card"><h2>${title}</h2>${chips}${addForm()}</div>`;
}
function addForm() {
  return `<div class="row"><input type="text" class="newname" placeholder="Name eintragen" maxlength="24" autocomplete="off"><button class="btn" data-act="addplayer">Hinzufügen</button></div>`;
}

function homeHTML() {
  const running = t => state.games[t] && !state.games[t].finished ? 'Läuft gerade – weiterspielen' : 'Neues Spiel starten';
  return `
    <div class="hero"><h1>Wer gewinnt heute?</h1><p class="muted">Wähl ein Spiel. Die Punkte werden automatisch gezählt.</p></div>
    <div class="grid2" style="margin-bottom:18px">
      <button class="game-card gc-skyjo" data-act="open" data-type="skyjo"><h2>Skyjo</h2><p>${GAMES.skyjo.rule}</p><span class="badge">${running('skyjo')}</span></button>
      <button class="game-card gc-flip7" data-act="open" data-type="flip7"><h2>Flip 7</h2><p>${GAMES.flip7.rule}</p><span class="badge">${running('flip7')}</span></button>
    </div>
    ${playersCard('Personen')}`;
}

function setupHTML(type) {
  const c = GAMES[type];
  const chips = state.players.length
    ? `<div class="chips">${state.players.map(p => `<button class="chip ${selected.has(p.id) ? 'on' : ''}" data-act="toggle" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>`
    : `<div class="empty">Noch keine Personen gespeichert. Trag unten Namen ein.</div><div style="height:12px"></div>`;
  return `
    <div class="card">
      <h2>Wer spielt mit?</h2>
      <p class="muted">Tippe auf die Namen, die mitspielen (mindestens 2).</p>
      ${chips}
      ${addForm()}
      <div class="row end" style="margin-top:18px">
        <button class="btn ghost" data-act="go" data-to="home">Zurück</button>
        <button class="btn" data-act="start" data-type="${type}" ${selected.size < 2 ? 'disabled' : ''}>${c.name} starten</button>
      </div>
    </div>`;
}

function gameHTML(type) {
  const c = GAMES[type];
  const g = state.games[type];
  const head = `<div class="gamehead"><div><h1>${c.name}</h1><p>${c.rule}</p></div></div>`;
  if (!g) return head + setupHTML(type);
  const t = totals(g);
  const win = winnerIdx(type, t);
  const names = g.players.map(id => player(id)?.name || 'Gelöscht');
  const dis = '';
  const rows = g.rounds.map((r, ri) => `<tr>
      <td>${ri + 1}<button class="rowdel" data-act="delround" data-r="${ri}" aria-label="Runde ${ri + 1} löschen">×</button></td>
      ${g.players.map((_, pi) => `<td><input class="cell" type="number" inputmode="numeric" step="1" data-r="${ri}" data-p="${pi}" value="${r[pi] ?? ''}" ${dis} aria-label="${esc(names[pi])}, Runde ${ri + 1}"></td>`).join('')}
    </tr>`).join('');
  const result = g.finished ? `
    <div class="result">
      <h2>${g.winners.length > 1 ? 'Gewonnen haben' : 'Gewonnen hat'} ${g.winners.map(id => esc(player(id)?.name || 'Gelöscht')).join(' &amp; ')}!</h2>
      <p class="muted">${c.name} ist beendet. Siege und Niederlagen sind in den Statistiken gespeichert.</p>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="btn" data-act="newgame" data-type="${type}">Neues Spiel</button>
        <button class="btn ghost" data-act="confetti">Nochmal Konfetti</button>
      </div>
    </div>` : '';
  const footer = `<div class="row end" style="margin-top:16px">
      ${g.finished ? '' : `<button class="btn ghost" data-act="abort" data-type="${type}">Spiel abbrechen</button>
      <button class="btn ghost" data-act="finish" data-type="${type}">Frühzeitig beenden</button>`}
      <button class="btn" data-act="addround">+ Runde</button></div>`;
  return `${head}${result}
    <div class="card" style="padding:14px">
      <div class="tablewrap"><table class="score">
        <thead><tr><th>Runde</th>${names.map(n => `<th>${esc(n)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Summe</td>${t.map((v, i) => `<td class="total ${g.finished && win.includes(i) ? 'win' : ''}" data-p="${i}">${v}</td>`).join('')}</tr></tfoot>
      </table></div>
      ${footer}
    </div>`;
}

function statsHTML() {
  const rows = state.players.map(p => {
    const s = p.stats, w = s.skyjo.w + s.flip7.w, l = s.skyjo.l + s.flip7.l, n = w + l;
    const pct = n ? Math.round(w / n * 100) : 0;
    return `<tr>
      <td>${esc(p.name)}</td>
      <td><span class="w">${s.skyjo.w}</span> / <span class="l">${s.skyjo.l}</span></td>
      <td><span class="w">${s.flip7.w}</span> / <span class="l">${s.flip7.l}</span></td>
      <td class="w">${w}</td><td class="l">${l}</td><td>${n}</td>
      <td>${pct}%<span class="bar"><i style="width:${pct}%"></i></span></td>
    </tr>`;
  }).join('');
  const table = state.players.length ? `<div class="tablewrap"><table class="stats">
      <thead><tr><th>Person</th><th>Skyjo (S / N)</th><th>Flip 7 (S / N)</th><th>Siege</th><th>Niederlagen</th><th>Spiele</th><th>Gewinnquote</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : `<div class="empty">Noch keine Personen. Füg unten die erste hinzu.</div>`;
  return `
    <div class="hero"><h1>Statistiken</h1><p class="muted">S = Siege, N = Niederlagen. Bei Gleichstand gewinnen alle mit dem besten Ergebnis.</p></div>
    <div class="card">${table}</div>
    ${playersCard('Person hinzufügen')}`;
}

function settingsHTML() {
  return `
    <div class="hero"><h1>Einstellungen</h1></div>
    <div class="card">
      <div class="setting"><div><strong>Darstellung</strong><div class="muted">Hell oder dunkel</div></div>
        <div class="seg"><button class="${state.theme === 'light' ? 'on' : ''}" data-act="theme" data-v="light">Hell</button><button class="${state.theme === 'dark' ? 'on' : ''}" data-act="theme" data-v="dark">Dunkel</button></div></div>
      <div class="setting"><div><strong>Daten exportieren</strong><div class="muted">Speichert Personen, Statistiken und laufende Spiele in einer .gt-Datei, die du weitergeben kannst.</div></div>
        <button class="btn" data-act="export">Exportieren</button></div>
      <div class="setting"><div><strong>Daten importieren</strong><div class="muted">Öffnet eine .gt-Datei und ersetzt die aktuellen Daten.</div></div>
        <button class="btn ghost" data-act="import">.gt-Datei öffnen</button>
        <input type="file" id="file" accept=".gt,application/json" hidden></div>
      <div class="setting"><div><strong>Alles zurücksetzen</strong><div class="muted">Löscht Personen, Statistiken und Spiele in diesem Browser.</div></div>
        <button class="btn danger" data-act="reset">Alles löschen</button></div>
    </div>`;
}

/* ---------- Aktionen ---------- */
function updateTotals(type) {
  const g = state.games[type];
  const t = totals(g), win = winnerIdx(type, t);
  document.querySelectorAll('.total').forEach(td => {
    const i = +td.dataset.p;
    const old = td.textContent;
    td.textContent = t[i];
    td.classList.toggle('lead', !g.finished && win.includes(i) && t.some(v => v !== 0));
    td.classList.toggle('danger', t[i] >= GAMES[type].limit * .85);
    if (old !== String(t[i])) { td.classList.remove('pop'); void td.offsetWidth; td.classList.add('pop'); }
  });
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const d = b.dataset, type = d.type || (view.startsWith('game:') ? view.slice(5) : null);
  switch (d.act) {
    case 'go': view = d.to; selected.clear(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'open': view = 'game:' + d.type; selected.clear(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'addplayer': {
      const inp = b.parentElement.querySelector('.newname');
      const p = addPlayer(inp.value);
      if (p && view.startsWith('game:')) selected.add(p.id);
      render();
      break;
    }
    case 'delplayer': {
      const p = player(d.id);
      if (p && confirm(`${p.name} samt Statistik entfernen?`)) { state.players = state.players.filter(x => x.id !== d.id); save(); render(); }
      break;
    }
    case 'toggle': selected.has(d.id) ? selected.delete(d.id) : selected.add(d.id); render(); break;
    case 'start': {
      const ids = state.players.filter(p => selected.has(p.id)).map(p => p.id);
      if (ids.length < 2) break;
      state.games[type] = { players: ids, rounds: [ids.map(() => null)], finished: false };
      save(); render();
      break;
    }
    case 'addround': {
      const g = state.games[type];
      if (g) { g.rounds.push(g.players.map(() => null)); save(); render(); const w = document.querySelector('.tablewrap'); if (w) w.scrollTo({ top: w.scrollHeight, behavior: 'smooth' }); }
      break;
    }
    case 'delround': {
      const g = state.games[type];
      g.rounds.splice(+d.r, 1);
      if (!g.rounds.length) g.rounds.push(g.players.map(() => null));
      save(); render();
      break;
    }
    case 'abort': if (confirm('Spiel abbrechen? Es wird nicht in die Statistik gezählt.')) { state.games[type] = null; selected.clear(); save(); render(); } break;
    case 'finish': if (confirm(GAMES[type].win === 'low' ? 'Spiel jetzt beenden? Es gewinnt, wer die wenigsten Punkte hat.' : 'Spiel jetzt beenden? Es gewinnt, wer die meisten Punkte hat.')) finishGame(type); break;
    case 'newgame': state.games[type] = null; selected.clear(); save(); render(); break;
    case 'confetti': confetti(); break;
    case 'theme': state.theme = d.v; save(); render(); break;
    case 'export': download('punktezettel.gt', JSON.stringify({ app: 'punktezettel', version: 1, exported: new Date().toISOString(), ...state }, null, 2)); break;
    case 'import': $('#file').click(); break;
    case 'reset': if (confirm('Wirklich alles löschen?')) { state = normalize(null); save(); render(); } break;
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'file') {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!Array.isArray(data.players)) throw 0;
        if (!confirm('Aktuelle Daten durch die Datei ersetzen?')) return;
        state = normalize(data); save(); render();
        alert('Import erfolgreich: ' + state.players.length + ' Personen geladen.');
      } catch (err) { alert('Diese Datei ist keine gültige .gt-Datei.'); }
    };
    r.readAsText(f);
    return;
  }
  if (e.target.classList.contains('cell')) {
    const type = view.slice(5), g = state.games[type];
    if (!g) return;
    const v = e.target.value.trim();
    g.rounds[+e.target.dataset.r][+e.target.dataset.p] = v === '' ? null : Math.round(Number(v));
    if (v !== '' && isNaN(Number(v))) g.rounds[+e.target.dataset.r][+e.target.dataset.p] = null;
    save();
    if (g.finished || !checkEnd(type)) updateTotals(type);
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.classList.contains('newname')) { e.target.parentElement.querySelector('[data-act="addplayer"]').click(); }
  else if (e.target.classList.contains('cell')) {
    const cells = [...document.querySelectorAll('.cell')], i = cells.indexOf(e.target);
    e.target.blur();
    if (cells[i + 1]) cells[i + 1].focus();
  }
});

/* ---------- Konfetti ---------- */
const cv = $('#confetti'), cx = cv.getContext('2d');
let parts = [], running = false;
const COLORS = ['#ff5f6d', '#ffb347', '#ffe66d', '#5cdb95', '#4cc9f0', '#7b6dff', '#e76dff', '#ffffff'];
function sizeCanvas() { cv.width = innerWidth; cv.height = innerHeight; }
addEventListener('resize', sizeCanvas); sizeCanvas();

function confetti() {
  const start = performance.now();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const spawn = () => {
    for (const side of [0, 1]) {
      parts.push({
        x: side ? cv.width + 10 : -10, y: cv.height * (.15 + Math.random() * .5),
        vx: (side ? -1 : 1) * (5 + Math.random() * 9), vy: -3 - Math.random() * 9,
        w: 7 + Math.random() * 7, h: 4 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - .5) * .4,
        c: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  };
  if (!running) { running = true; requestAnimationFrame(function tick(now) {
    const age = now - start;
    if (age < 3500) for (let i = 0; i < 4; i++) spawn();
    cx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach(p => {
      p.vy += .22; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
    });
    parts = parts.filter(p => p.y < cv.height + 30);
    if (parts.length || age < 3500) requestAnimationFrame(tick);
    else { cx.clearRect(0, 0, cv.width, cv.height); running = false; }
  }); }
}

render();
})();
