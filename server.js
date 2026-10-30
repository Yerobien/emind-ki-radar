'use strict';
// KI-Radar – Use-Cases für die KI-Transformation sammeln, bewerten und als Roadmap planen.
// Node.js + Express + Socket.io, Speicherung in einer JSON-Datei (keine nativen Abhängigkeiten).

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const CFG = {
  PORT: +process.env.PORT || 3000,
  ADMIN_KEY: process.env.ADMIN_KEY || 'radar',
  DATA_FILE: process.env.DATA_FILE || path.join(__dirname, 'data', 'radar.json'),
  PUBLIC_URL: process.env.PUBLIC_URL || '',
};

// Stammdaten
const TEAMS = ['Entwicklung', 'Admin / Ops', 'QA / Test', 'Support', 'Projekt / PM', 'Vertrieb', 'Management', 'Sonstiges'];
const FREQS = { taeglich: { label: 'täglich', perMonth: 20 }, woechentlich: { label: 'wöchentlich', perMonth: 4 }, monatlich: { label: 'monatlich', perMonth: 1 }, selten: { label: 'seltener', perMonth: 0.25 } };
const KI_USE = ['nie', 'ab und zu', 'wöchentlich', 'täglich'];
const BLOCKERS = ['Wissen / Übung', 'Zeit', 'Datenschutz / Unsicherheit', 'Fehlende Tools / Zugänge', 'Vertrauen in Ergebnisse', 'Nichts – läuft!'];
const STATUS = ['Idee', 'Pilot', 'Im Einsatz', 'Verworfen'];
const LANES = ['Jetzt', 'Als Nächstes', 'Später'];

// ---------- Speicher ----------
let db = { people: {}, ideas: [] };
try { db = JSON.parse(fs.readFileSync(CFG.DATA_FILE, 'utf8')); } catch (e) { /* frischer Start */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(CFG.DATA_FILE), { recursive: true });
    const tmp = CFG.DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, CFG.DATA_FILE);
  }, 300);
}

const clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const clamp = (v, a, b) => Math.min(b, Math.max(a, Math.round(+v || 0)));

// ---------- Auswertung ----------
function aggregate(idea) {
  const votes = Object.values(idea.votes || {});
  const n = votes.length;
  const avg = k => (n ? votes.reduce((a, v) => a + v[k], 0) / n : null);
  const nutzen = avg('nutzen'), aufwand = avg('aufwand');
  const metoo = votes.filter(v => v.metoo).length;
  const pilot = votes.filter(v => v.pilot).length;
  // Zeitpotenzial: Minuten pro Mal × Häufigkeit × (Einreicher + "betrifft mich auch")
  const hours = ((idea.minutes || 0) * (FREQS[idea.freq] ? FREQS[idea.freq].perMonth : 0) * (1 + metoo)) / 60;
  let quadrant = 'Unbewertet';
  if (n) quadrant = nutzen >= 3 ? (aufwand < 3 ? 'Quick Win' : 'Großprojekt') : (aufwand < 3 ? 'Nebenbei' : 'Lohnt eher nicht');
  const autoLane = { 'Quick Win': 'Jetzt', 'Großprojekt': 'Als Nächstes', 'Nebenbei': 'Später', 'Lohnt eher nicht': 'Später', 'Unbewertet': 'Später' }[quadrant];
  const lane = idea.status === 'Im Einsatz' ? 'Im Einsatz' : idea.status === 'Verworfen' ? 'Verworfen' : (idea.lane || autoLane);
  return { n, nutzen, aufwand, metoo, pilot, hours: Math.round(hours * 10) / 10, quadrant, lane, laneAuto: !idea.lane };
}
function publicState() {
  const people = Object.values(db.people);
  const ideas = db.ideas.map(i => ({
    id: i.id, title: i.title, desc: i.desc, team: i.team, freq: i.freq, minutes: i.minutes,
    author: (db.people[i.author] || {}).name || '?', createdAt: i.createdAt, status: i.status, owner: i.owner || '',
    ...aggregate(i),
  }));
  const count = (arr, key) => arr.reduce((m, p) => ((m[p[key]] = (m[p[key]] || 0) + 1), m), {});
  return {
    meta: { teams: TEAMS, freqs: FREQS, kiUse: KI_USE, blockers: BLOCKERS, status: STATUS, lanes: LANES },
    ideas,
    stats: {
      people: people.length,
      ideas: ideas.length,
      votes: db.ideas.reduce((a, i) => a + Object.keys(i.votes || {}).length, 0),
      hours: Math.round(ideas.filter(i => i.status !== 'Verworfen').reduce((a, i) => a + i.hours, 0)),
      byTeam: count(people, 'team'), byUse: count(people, 'kiUse'), byBlocker: count(people, 'blocker'),
    },
  };
}
function myState(pid) {
  const p = db.people[pid]; if (!p) return null;
  const votes = {};
  for (const i of db.ideas) if (i.votes && i.votes[pid]) votes[i.id] = i.votes[pid];
  return { pid, name: p.name, team: p.team, votes };
}

// ---------- Server ----------
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '5mb' }));
const server = http.createServer(app);
const io = new Server(server);
const pub = path.join(__dirname, 'public');

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return 'localhost';
}
function joinUrl(req) {
  if (CFG.PUBLIC_URL) return CFG.PUBLIC_URL;
  const host = req.get('host') || '';
  if (!/^(localhost|127\.)/.test(host)) return `${req.protocol}://${host}/`;
  return `http://${lanIp()}:${CFG.PORT}/`;
}
const isAdmin = req => req.query.key === CFG.ADMIN_KEY;

app.get('/board', (req, res) => res.sendFile(path.join(pub, 'board.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(pub, 'admin.html')));
app.get('/info', (req, res) => res.json({ joinUrl: joinUrl(req) }));
app.get('/qr.svg', async (req, res) => res.type('image/svg+xml').send(await QRCode.toString(joinUrl(req), { type: 'svg', margin: 1 })));

// Export / Import (Admin) – wichtig auf Hosts ohne dauerhafte Festplatte (Render Free)
app.get('/export.json', (req, res) => {
  if (!isAdmin(req)) return res.status(403).send('Falscher Key');
  res.attachment(`ki-radar-${new Date().toISOString().slice(0, 10)}.json`).json(db);
});
app.get('/export.csv', (req, res) => {
  if (!isAdmin(req)) return res.status(403).send('Falscher Key');
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['Titel', 'Beschreibung', 'Bereich', 'Häufigkeit', 'Minuten pro Mal', 'Eingereicht von', 'Bewertungen', 'Nutzen Ø', 'Aufwand Ø', 'Betrifft auch', 'Pilot-Interesse', 'Potenzial h/Monat', 'Quadrant', 'Roadmap', 'Status', 'Verantwortlich']];
  for (const i of publicState().ideas) rows.push([i.title, i.desc, i.team, (FREQS[i.freq] || {}).label, i.minutes, i.author, i.n,
    i.nutzen == null ? '' : i.nutzen.toFixed(1).replace('.', ','), i.aufwand == null ? '' : i.aufwand.toFixed(1).replace('.', ','),
    i.metoo, i.pilot, String(i.hours).replace('.', ','), i.quadrant, i.lane, i.status, i.owner]);
  res.attachment(`ki-radar-${new Date().toISOString().slice(0, 10)}.csv`).type('text/csv')
    .send('﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'));
});
app.post('/import', (req, res) => {
  if (!isAdmin(req)) return res.status(403).send('Falscher Key');
  const d = req.body;
  if (!d || typeof d.people !== 'object' || !Array.isArray(d.ideas)) return res.status(400).send('Ungültige Datei');
  db = { people: d.people, ideas: d.ideas }; save(); broadcast();
  res.json({ ok: true, ideas: db.ideas.length, people: Object.keys(db.people).length });
});
app.use(express.static(pub));

function broadcast() { io.emit('state', publicState()); }
let bTimer = null;
const broadcastSoon = () => { clearTimeout(bTimer); bTimer = setTimeout(broadcast, 150); };

io.on('connection', socket => {
  socket.emit('state', publicState());
  const me = () => db.people[socket.data.pid];

  socket.on('join', (d = {}, cb) => {
    let pid = d.pid && db.people[d.pid] ? d.pid : null;
    const name = clean(d.name, 40) || 'Anonym';
    const team = TEAMS.includes(d.team) ? d.team : 'Sonstiges';
    const kiUse = KI_USE.includes(d.kiUse) ? d.kiUse : (pid ? db.people[pid].kiUse : KI_USE[0]);
    const blocker = BLOCKERS.includes(d.blocker) ? d.blocker : (pid ? db.people[pid].blocker : BLOCKERS[0]);
    if (!pid) pid = crypto.randomUUID();
    db.people[pid] = { ...(db.people[pid] || { joinedAt: Date.now() }), name, team, kiUse, blocker };
    socket.data.pid = pid; save(); broadcastSoon();
    if (typeof cb === 'function') cb(myState(pid));
  });

  socket.on('resume', (pid, cb) => {
    if (db.people[pid]) { socket.data.pid = pid; cb(myState(pid)); } else cb(null);
  });

  socket.on('addIdea', (d = {}, cb) => {
    if (!me()) return cb && cb({ err: 'Bitte zuerst anmelden.' });
    const title = clean(d.title, 120);
    if (title.length < 3) return cb && cb({ err: 'Titel ist zu kurz.' });
    const idea = {
      id: crypto.randomUUID().slice(0, 8), title, desc: clean(d.desc, 600),
      team: TEAMS.includes(d.team) ? d.team : me().team, freq: FREQS[d.freq] ? d.freq : 'woechentlich',
      minutes: clamp(d.minutes, 0, 2400), author: socket.data.pid, createdAt: Date.now(),
      status: 'Idee', owner: '', lane: null, votes: {},
    };
    db.ideas.push(idea); save(); broadcastSoon();
    cb && cb({ ok: true, id: idea.id });
  });

  socket.on('vote', (d = {}, cb) => {
    const idea = db.ideas.find(i => i.id === d.id);
    if (!me() || !idea) return cb && cb({ err: 'Nicht gefunden.' });
    idea.votes = idea.votes || {};
    idea.votes[socket.data.pid] = { nutzen: clamp(d.nutzen, 1, 5), aufwand: clamp(d.aufwand, 1, 5), metoo: !!d.metoo, pilot: !!d.pilot };
    save(); broadcastSoon();
    cb && cb(myState(socket.data.pid));
  });

  socket.on('admin', (d = {}, cb) => {
    const reply = r => typeof cb === 'function' && cb(r);
    if (d.key !== CFG.ADMIN_KEY) return reply({ err: 'Falscher Admin-Key' });
    if (d.cmd === 'hello') return reply({ ok: true });
    const idea = db.ideas.find(i => i.id === d.id);
    if (d.cmd === 'update' && idea) {
      if (d.status && STATUS.includes(d.status)) idea.status = d.status;
      if ('owner' in d) idea.owner = clean(d.owner, 60);
      if ('lane' in d) idea.lane = LANES.includes(d.lane) ? d.lane : null;
      if ('title' in d && clean(d.title, 120).length >= 3) idea.title = clean(d.title, 120);
      if ('desc' in d) idea.desc = clean(d.desc, 600);
    } else if (d.cmd === 'delete' && idea) {
      db.ideas = db.ideas.filter(i => i !== idea);
    } else if (d.cmd === 'merge' && idea) {
      // Dublette "idea" in "target" zusammenführen: Stimmen übernehmen (vorhandene im Ziel bleiben)
      const target = db.ideas.find(i => i.id === d.target);
      if (!target || target === idea) return reply({ err: 'Ziel nicht gefunden.' });
      target.votes = { ...(idea.votes || {}), ...(target.votes || {}) };
      if (idea.desc && !target.desc.includes(idea.desc)) target.desc = clean(`${target.desc} | ${idea.desc}`, 600);
      db.ideas = db.ideas.filter(i => i !== idea);
    } else return reply({ err: 'Unbekannter Befehl' });
    save(); broadcast(); reply({ ok: true });
  });
});

server.listen(CFG.PORT, () => {
  console.log(`KI-Radar läuft auf Port ${CFG.PORT} (${db.ideas.length} Ideen, ${Object.keys(db.people).length} Personen, Datei ${CFG.DATA_FILE})`);
  console.log(`  Mitmachen: http://${lanIp()}:${CFG.PORT}/`);
  console.log(`  Beamer:    http://localhost:${CFG.PORT}/board`);
  console.log(`  Admin:     http://localhost:${CFG.PORT}/admin?key=${CFG.ADMIN_KEY}`);
});
