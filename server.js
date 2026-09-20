'use strict';
// No external npm packages. HTTP room/state server for small, trusted Scrum teams.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8765);
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'));
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SIZES = ['Small', 'Medium', 'Large'];
const POINTS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const RAW = [
  ['Small','Small','Small',1], ['Small','Small','Medium',2], ['Small','Small','Large',5],
  ['Small','Medium','Small',2], ['Small','Medium','Medium',3], ['Small','Medium','Large',5],
  ['Small','Large','Small',3], ['Small','Large','Medium',5], ['Small','Large','Large',8],
  ['Medium','Small','Small',3], ['Medium','Small','Medium',5], ['Medium','Small','Large',8],
  ['Medium','Medium','Small',5], ['Medium','Medium','Medium',5], ['Medium','Medium','Large',8],
  ['Medium','Large','Small',5], ['Medium','Large','Medium',8],
  ['Large','Medium','Small',8], ['Large','Medium','Medium',8], ['Large','Medium','Large',13],
  ['Large','Large','Small',8], ['Large','Large','Medium',13], ['Large','Large','Large',13]
];
const baseMapping = Object.fromEntries(RAW.map(v => [v.slice(0, 3).join('|'), v[3]]));
const validKeys = new Set(SIZES.flatMap(a => SIZES.flatMap(b => SIZES.map(c => [a,b,c].join('|')))));
const rooms = new Map();
const randomToken = () => crypto.randomBytes(24).toString('hex');
const roomCode = () => Array.from(crypto.randomBytes(8), n => ALPHABET[n % ALPHABET.length]).join('');
const isRecent = u => Date.now() - u.lastSeen < 35000;
const error = (status, text) => { const e = new Error(text); e.status = status; throw e; };
const isName = s => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= 60;
const pointOf = (values, mapping) => Array.isArray(values) && values.length === 3 && values.every(v => SIZES.includes(v)) ? mapping[values.join('|')] ?? null : null;

function addRoom(name) {
  let code;
  do { code = roomCode(); } while (rooms.has(code));
  const host = { id: 'host', token: randomToken(), name: name.trim(), isHost: true, lastSeen: Date.now(), vote: null };
  const room = {
    code, members: new Map([[host.token, host]]),
    issue: { title: 'Örnek: Kullanıcı giriş ekranı geliştirilmesi', description: 'Story açıklamasını moderatör buradan düzenleyebilir.' },
    mappings: { ...baseMapping }, round: 1, revealed: false, history: [], lastActive: Date.now()
  };
  rooms.set(code, room);
  return { room, host };
}
function getRoom(code) {
  const room = rooms.get(String(code || '').trim().toUpperCase());
  if (!room) error(404, 'Oda bulunamadı veya kapatıldı. Moderatörden güncel kodu iste.');
  return room;
}
function authenticate(code, token) {
  const room = getRoom(code);
  const user = room.members.get(String(token || ''));
  if (!user) error(401, 'Bu oda için oturumun geçerli değil. Yeniden katıl.');
  user.lastSeen = Date.now(); room.lastActive = Date.now();
  return { room, user };
}
function publicState(room, user) {
  const members = {};
  for (const m of room.members.values()) {
    if (!isRecent(m)) continue;
    members[m.id] = {
      id: m.id, name: m.name, isHost: m.isHost, connected: true,
      voted: !!m.vote, vote: room.revealed || m.id === user.id ? m.vote : null,
      points: room.revealed && m.vote ? pointOf(m.vote, room.mappings) : null
    };
  }
  // The lookup table stays server-side for participants, even in API responses.
  // Return only the result of their SAVED vote, never a draft estimate.
  const common = {
    issue: room.issue, round: room.round, revealed: room.revealed,
    members, ownVote: user.vote,
    ownPoints: user.vote ? pointOf(user.vote, room.mappings) : null
  };
  return user.isHost
    ? { ...common, mappings: room.mappings, history: room.history }
    : common;
}
function responseFor(room, user) {
  return { code: room.code, token: user.token, id: user.id, name: user.name,
    role: user.isHost ? 'host' : 'member', state: publicState(room, user) };
}
function archive(room) {
  if (!room.revealed) return;
  const votes = [...room.members.values()].filter(m => m.vote).map(m => ({
    name: m.name, selection: [...m.vote], points: pointOf(m.vote, room.mappings)
  }));
  if (!votes.length) return;
  room.history.push({ title: room.issue.title, description: room.issue.description,
    round: room.round, date: new Date().toISOString(), votes });
  if (room.history.length > 100) room.history.shift();
}
function nextRound(room) {
  archive(room); room.round++; room.revealed = false;
  for (const m of room.members.values()) m.vote = null;
}
function doAction(room, user, data) {
  const action = data.action;
  if (action === 'vote') {
    if (room.revealed) error(409, 'Oylar açıldı. Yeni turu bekle.');
    if (data.selection !== null && pointOf(data.selection, room.mappings) === null)
      error(400, 'Seçim eksik veya eşleştirme tablosunda tanımsız.');
    user.vote = data.selection === null ? null : [...data.selection];
    return;
  }
  if (action === 'leave') {
    if (user.isHost) rooms.delete(room.code);
    else room.members.delete(user.token);
    return;
  }
  if (!user.isHost) error(403, 'Bu işlem yalnızca moderatör tarafından yapılabilir.');
  switch (action) {
    case 'reveal':
      if (![...room.members.values()].some(m => m.vote)) error(409, 'Gösterilecek oy yok.');
      room.revealed = true; break;
    case 'new-round': nextRound(room); break;
    case 'issue': {
      const title = data.title, description = data.description;
      if (typeof title !== 'string' || !title.trim() || title.length > 140 ||
          typeof description !== 'string' || description.length > 1300) error(400, 'İş bilgileri geçersiz.');
      if (room.issue.title !== title.trim() || room.issue.description !== description) {
        nextRound(room);
        room.issue = { title: title.trim(), description };
      }
      break;
    }
    case 'mapping': {
      const incoming = data.mapping;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) error(400, 'Puan tablosu geçersiz.');
      const mapping = {};
      for (const [key, value] of Object.entries(incoming)) {
        if (!validKeys.has(key) || !POINTS.includes(value)) error(400, 'Puan tablosunda geçersiz bir satır var.');
        mapping[key] = value;
      }
      // Preserve already-cast votes by removing selections whose mapping disappeared.
      for (const m of room.members.values()) if (m.vote && pointOf(m.vote, mapping) === null) m.vote = null;
      room.mappings = mapping;
      break;
    }
    default: error(400, 'Bilinmeyen işlem.');
  }
}
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
async function readJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) error(415, 'JSON içerik türü gerekli.');
  const pieces = []; let length = 0;
  for await (const part of req) {
    length += part.length; if (length > 16000) error(413, 'İstek çok büyük.');
    pieces.push(part);
  }
  try { return JSON.parse(Buffer.concat(pieces).toString('utf8')); }
  catch { error(400, 'İstek JSON biçiminde olmalı.'); }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(HTML); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      send(res, 200, { ok: true, rooms: rooms.size }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const {room,user} = authenticate(url.searchParams.get('code'), url.searchParams.get('token'));
      send(res, 200, responseFor(room, user)); return;
    }
    if (req.method !== 'POST' || !['/api/create','/api/join','/api/action'].includes(url.pathname))
      error(404, 'Sayfa veya API bulunamadı.');
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) error(403, 'Başka bir siteden istek kabul edilmiyor.');
    const data = await readJson(req);
    if (!data || typeof data !== 'object' || Array.isArray(data)) error(400, 'Geçersiz istek.');
    if (url.pathname === '/api/create') {
      if (!isName(data.name)) error(400, 'Geçerli bir ad gir.');
      const {room,host} = addRoom(data.name); send(res, 201, responseFor(room,host)); return;
    }
    if (url.pathname === '/api/join') {
      if (!isName(data.name)) error(400, 'Geçerli bir ad gir.');
      const room = getRoom(data.code);
      const host = [...room.members.values()].find(m => m.isHost);
      if (!host || !isRecent(host)) error(409, 'Moderatör şu anda bağlı değil. Odayı açmasını iste.');
      if ([...room.members.values()].filter(isRecent).length >= 50) error(409, 'Oda dolu (en fazla 50 kişi).');
      const user = { id: crypto.randomBytes(8).toString('hex'), token: randomToken(),
        name: data.name.trim(), isHost: false, lastSeen: Date.now(), vote: null };
      room.members.set(user.token, user); room.lastActive = Date.now();
      send(res, 201, responseFor(room, user)); return;
    }
    const {room,user} = authenticate(data.code, data.token);
    doAction(room, user, data);
    if (data.action === 'leave') { send(res, 200, {ok:true}); return; }
    send(res, 200, responseFor(room, user));
  } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : 'Sunucu hatası.' }); if (!e.status) console.error(e); }
});
// Limit accumulation of rooms from abandoned demo sessions.
const cleanTimer = setInterval(() => {
  for (const [code,room] of rooms) if (Date.now() - room.lastActive > 8 * 60 * 60 * 1000) rooms.delete(code);
}, 15 * 60 * 1000);
cleanTimer.unref();
server.listen(PORT, '0.0.0.0', () => {
  console.log('\nScrum Poker sunucusu hazır.');
  console.log(`Bu bilgisayardan: http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) if (n.family === 'IPv4' && !n.internal)
      console.log(`Aynı ağdaki ekip üyeleri: http://${n.address}:${PORT}`);
  }
  console.log('Farklı ağdaki ekip üyeleri için sunucuyu HTTPS ile internette yayınlamanız gerekir.');
  console.log('Kapatmak için Ctrl+C.\n');
});
