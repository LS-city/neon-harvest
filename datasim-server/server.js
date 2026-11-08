// Data Sim live-data server
// Zero dependencies. Needs Node 18 or newer (uses the built-in fetch).
//
//   node server.js        then open http://localhost:3000
//
// Serves the game from ./public and gives it one data route:
//   GET /api/health                  -> which sources are switched on
//   GET /api/topic?q=hemp%20wraps&cat=smoke&state=FL&zip=32801
//                                    -> real findings for one watchlist topic in one area
//
// Sources:
//   Wikipedia page views  (free, no key)  -> is interest in the topic rising? (national, English)
//   YouTube Data API v3   (free key)      -> top videos this week, searched with the area's name
//   OpenStreetMap         (free, no key)  -> real places near a ZIP that match the topic
//   Zippopotam.us         (free, no key)  -> turns a ZIP into a town name and map position
//
// The server allows other websites (like NEON HARVEST on GitHub Pages) to call it.
//
// Results are cached per topic (CACHE_HOURS, default 6) so the free YouTube
// quota lasts. Each YouTube search costs 100 of your 10,000 daily units.

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------- settings (.env file or real environment variables) ----------
loadEnv(path.join(__dirname, '.env'));
const PORT = Number(process.env.PORT) || 3000;
const YT_KEY = (process.env.YOUTUBE_API_KEY || '').trim();
const CACHE_HOURS = Number(process.env.CACHE_HOURS) || 6;
const CONTACT = process.env.CONTACT_EMAIL || 'not-set';
const MOCK = process.env.DATASIM_MOCK === '1';
const UA = `DataSimGame/1.0 (self-hosted game server; contact: ${CONTACT})`;

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env file is fine */ }
}

// ---------- helpers ----------
const day = 86400000;
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
async function getJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || 12000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    if (!r.ok) {
      let detail = '';
      try { const j = await r.json(); detail = j?.error?.message || j?.detail || j?.title || ''; } catch {}
      throw new Error(`HTTP ${r.status}${detail ? ': ' + detail : ''}`);
    }
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`timed out after ${(opts.timeout || 12000) / 1000}s`);
    const c = e.cause && (e.cause.code || e.cause.message);
    throw c ? new Error(`${e.message} (${c})`) : e;
  } finally { clearTimeout(t); }
}
function isoMinutes(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
  return (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) + (+(m[4] || 0)) / 60;
}

// ---------- areas ----------
const STATE_NAMES={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'Washington DC',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',PR:'Puerto Rico'};
const zipCache = new Map();
async function resolveArea(st, zip) {
  const area = { st: STATE_NAMES[st] ? st : '', zip: /^\d{5}$/.test(zip) ? zip : '', place: '', lat: null, lon: null };
  if (area.zip) {
    let z = zipCache.get(area.zip);
    if (!z) {
      try {
        const j = await getJSON('https://api.zippopotam.us/us/' + area.zip);
        const p = j.places && j.places[0];
        z = p ? { place: p['place name'], st: p['state abbreviation'], lat: +p.latitude, lon: +p.longitude } : null;
        zipCache.set(area.zip, z); // a real "not found" is cached; network errors are retried next time
      } catch { z = null; }
    }
    if (z) { area.place = z.place; area.lat = z.lat; area.lon = z.lon; if (!area.st) area.st = z.st; }
  }
  area.label = area.zip ? `${area.place ? area.place + ' ' : ''}${area.zip}${area.st ? ', ' + area.st : ''}` : area.st ? STATE_NAMES[area.st] : 'United States';
  area.searchName = area.place ? `${area.place} ${STATE_NAMES[area.st] || ''}`.trim() : area.st ? STATE_NAMES[area.st] : '';
  return area;
}

// ---------- source: OpenStreetMap places near a ZIP ----------
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const SMOKE_SHOPS = 'tobacco|e-cigarette|cannabis|head_shop|smoke_shop';
async function places(topic, cat, area) {
  if (area.lat == null) return [];
  const R = 16000; // about 10 miles
  const word = topic.replace(/^@/, '').replace(/["\\]/g, '').trim();
  const esc = word.replace(/[.*+?^${}()|[\]]/g, '.');
  const near = `(around:${R},${area.lat},${area.lon})`;
  const words = esc.split(/\s+/).filter(w => w.length > 2).join('|') || esc;
  const parts = [`nwr["name"~"${esc}",i]${near};`, `nwr["cuisine"~"${words}",i]${near};`, `nwr["brand"~"${esc}",i]${near};`];
  if (cat === 'smoke') parts.push(`nwr["shop"~"${SMOKE_SHOPS}"]${near};`);
  if (cat === 'foodshops') parts.push(`nwr["amenity"~"restaurant|fast_food|cafe"]["cuisine"~"${words}",i]${near};`);
  const q = `[out:json][timeout:20];(${parts.join('')});out center 60;`;
  let j, lastErr;
  for (const ep of OVERPASS) {
    try { j = await getJSON(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, timeout: 25000 }); break; }
    catch (e) { lastErr = e; }
  }
  if (!j) throw lastErr;
  const seen = new Set(), rows = [];
  for (const e of j.elements || []) {
    const t = e.tags || {}; if (!t.name) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon; if (lat == null) continue;
    const key = t.name + '|' + lat.toFixed(3); if (seen.has(key)) continue; seen.add(key);
    const mi = Math.round(haversineMi(area.lat, area.lon, lat, lon) * 10) / 10;
    const kind = t.shop || t.amenity || t.craft || 'place';
    const addr = [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ');
    rows.push({
      source: 'OpenStreetMap places', item: t.name, metric: 'Miles from ZIP ' + area.zip, value: mi, growth: null, region: area.label,
      note: [kind.replace(/_/g, ' '), t.cuisine ? 'cuisine: ' + t.cuisine.replace(/_/g, ' ') : '', addr, t.opening_hours ? 'hours: ' + t.opening_hours : ''].filter(Boolean).join(' · '),
      url: `https://www.openstreetmap.org/${e.type}/${e.id}`
    });
  }
  rows.sort((a, b) => a.value - b.value);
  const top = rows.slice(0, 8);
  if (rows.length) top.unshift({ source: 'OpenStreetMap places', item: `Places matching "${word}" near ${area.label}`, metric: 'Places within 10 miles', value: rows.length, growth: null, region: area.label, note: `Closest: ${rows[0].item} (${rows[0].value} mi). Map data © OpenStreetMap contributors.`, url: `https://www.openstreetmap.org/search?query=${encodeURIComponent(word + ' ' + area.label)}` });
  return top;
}
function haversineMi(a, b, c, d) { const r = x => x * Math.PI / 180, R = 3958.8; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

// ---------- source: Wikipedia page views ----------
async function wikipedia(topic) {
  const q = topic.replace(/^@/, '');
  const os = await getJSON('https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&namespace=0&search=' + encodeURIComponent(q));
  let title = os?.[1]?.[0];
  if (!title) return [];
  // follow redirects ("Birria tacos" -> "Birria") so the page views are the real article's
  try {
    const rq = await getJSON('https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=' + encodeURIComponent(title));
    const pg = Object.values(rq?.query?.pages || {})[0];
    if (pg && pg.title && !('missing' in pg)) title = pg.title;
  } catch { /* keep the search title */ }
  const end = new Date(Date.now() - day);            // yesterday (today is incomplete)
  const start = new Date(end.getTime() - 13 * day);  // 14 days total
  const art = encodeURIComponent(title.replace(/ /g, '_'));
  const pv = await getJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${art}/daily/${ymd(start)}00/${ymd(end)}00`);
  const series = (pv.items || []).map(i => ({ date: i.timestamp.slice(0, 8), views: i.views }));
  if (series.length < 2) return [];
  const last7 = series.slice(-7).reduce((a, s) => a + s.views, 0);
  const prev7 = series.slice(-14, -7).reduce((a, s) => a + s.views, 0);
  const peak = series.reduce((a, s) => (s.views > a.views ? s : a), series[0]);
  return [{
    source: 'Wikipedia page views',
    item: `${title} (Wikipedia article)`,
    metric: 'Page views, last 7 days',
    value: last7,
    growth: prev7 > 0 ? Math.round((last7 - prev7) / prev7 * 100) : null,
    region: 'National (English Wikipedia)',
    note: `Previous 7 days: ${prev7.toLocaleString('en-US')} · Peak ${peak.date.slice(4, 6)}/${peak.date.slice(6)}: ${peak.views.toLocaleString('en-US')}`,
    url: 'https://en.wikipedia.org/wiki/' + art,
    series
  }];
}

// ---------- source: YouTube Data API ----------
async function youtube(topic, cat, area) {
  if (!YT_KEY) return [];
  const q = area && area.searchName ? `${topic} ${area.searchName}` : topic;
  const after = new Date(Date.now() - 7 * day).toISOString();
  const p = new URLSearchParams({
    part: 'snippet', type: 'video', order: 'viewCount', maxResults: '10',
    publishedAfter: after, regionCode: 'US', relevanceLanguage: 'en', q, key: YT_KEY
  });
  if (cat === 'longwatch') p.set('videoDuration', 'long'); // longer than 20 minutes
  const s = await getJSON('https://www.googleapis.com/youtube/v3/search?' + p);
  const ids = (s.items || []).map(i => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = await getJSON('https://www.googleapis.com/youtube/v3/videos?' + new URLSearchParams({ part: 'snippet,statistics,contentDetails', id: ids.join(','), key: YT_KEY }));
  return (v.items || []).map(it => {
    const views = +(it.statistics?.viewCount || 0);
    const mins = isoMinutes(it.contentDetails?.duration);
    const ageDays = Math.max(1, (Date.now() - new Date(it.snippet.publishedAt)) / day);
    return {
      source: 'YouTube',
      item: it.snippet.title,
      metric: mins >= 10 ? 'Views (10+ min video)' : 'Views',
      value: views,
      growth: null,
      region: area && area.searchName ? `${area.label} (searched by name)` : 'US',
      note: `${it.snippet.channelTitle} · ${Math.round(mins)} min · ${Math.round(views / ageDays).toLocaleString('en-US')} views/day · ${(+(it.statistics?.likeCount || 0)).toLocaleString('en-US')} likes · ${(+(it.statistics?.commentCount || 0)).toLocaleString('en-US')} comments`,
      url: 'https://www.youtube.com/watch?v=' + it.id,
      publishedAt: it.snippet.publishedAt
    };
  }).filter(f => cat !== 'longwatch' || f.metric.startsWith('Views (10+'));
}

// ---------- test mode (no internet needed) ----------
function mock(topic, area) {
  const base = 1000 + Math.floor(Math.random() * 50000), reg = 'Test · ' + area.label;
  return [{ source: 'MOCK test data', item: `${topic} (test row)`, metric: 'Page views, last 7 days', value: base, growth: Math.round(Math.random() * 120 - 20), region: reg, note: 'DATASIM_MOCK=1 is on. These rows are not real.', url: '' },
    ...Array.from({ length: 4 }, (_, i) => ({ source: 'MOCK test data', item: `${topic} video ${i + 1} (test row)`, metric: 'Views', value: base * (i + 2), growth: null, region: reg, note: 'DATASIM_MOCK=1 is on. These rows are not real.', url: '' }))];
}

// ---------- cache + route ----------
const cache = new Map(); // key -> {at, promise|data}
async function collect(topic, cat, st, zip) {
  const key = [cat, topic.toLowerCase(), st, zip].join('|');
  let entry = cache.get(key);
  if (!entry || Date.now() - entry.at >= CACHE_HOURS * 3600000) {
    entry = {
      at: Date.now(),
      promise: (async () => {
        const area = MOCK ? { st, zip, place: zip ? 'Testville' : '', label: zip ? `Testville ${zip}` : st || 'United States' } : await resolveArea(st, zip);
        if (MOCK) return { finds: mock(topic, area), errors: [], area };
        const errors = [];
        const run = async (name, fn) => { try { return await fn(); } catch (e) { errors.push({ source: name, message: String(e.message || e) }); return []; } };
        if (zip && area.lat == null) errors.push({ source: 'ZIP lookup', message: `Couldn't find ZIP ${zip}, so nearby places were skipped.` });
        const [p, w, y] = await Promise.all([run('OpenStreetMap', () => places(topic, cat, area)), run('Wikipedia', () => wikipedia(topic)), run('YouTube', () => youtube(topic, cat, area))]);
        return { finds: [...p, ...w, ...y], errors, area: { st: area.st, zip: area.zip, place: area.place, label: area.label } };
      })()
    };
    cache.set(key, entry);
  }
  const res = await entry.promise;
  // don't keep a result where every source failed; let the next request retry
  if (!res.finds.length && res.errors.length && cache.get(key) === entry) cache.delete(key);
  return { ...res, fetchedAt: new Date(entry.at).toISOString(), nextRefresh: new Date(entry.at + CACHE_HOURS * 3600000).toISOString() };
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' }); return res.end(); }
  try {
    if (url.pathname === '/api/health') {
      return send(res, 200, { ok: true, mock: MOCK, cacheHours: CACHE_HOURS, sources: { wikipedia: true, youtube: !!YT_KEY, places: true } });
    }
    if (url.pathname === '/api/topic') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
      const cat = (url.searchParams.get('cat') || '').replace(/[^a-z]/g, '').slice(0, 20);
      const st = (url.searchParams.get('state') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
      const zip = (url.searchParams.get('zip') || '').replace(/\D/g, '').slice(0, 5);
      if (!q) return send(res, 400, { error: 'Add ?q=topic to the address.' });
      const out = await collect(q, cat, st, zip);
      return send(res, 200, { topic: q, cat, ...out });
    }
    // static files
    let file = path.normalize(path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(path.join(__dirname, 'public'))) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(file, (err, buf) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream'));
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => {
  console.log(`\n  DATA SIM is running:  http://localhost:${PORT}`);
  console.log(`  Wikipedia: on   OpenStreetMap places: on   YouTube: ${YT_KEY ? 'on' : 'off (add YOUTUBE_API_KEY to .env)'}${MOCK ? '   MOCK MODE ON' : ''}\n`);
});
