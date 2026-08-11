/* Choir — app logic
   Hash-routed single page app. No build step, no framework.
   Data: data/songs.json (catalog) + data/calendar.json (services + news).
   Files: audio/ and images/.
*/

const MEDIA_CACHE = 'choir-materials-media-v3';

/* How far ahead the rolling calendar looks: the current service plus the
   next two weeks. Entries drop off automatically once their date passes. */
const CALENDAR_DAYS_AHEAD = 20;

const SERVICE_TYPES = {
  sunday_am:  { short: 'Morning',   long: 'Sunday Morning',  order: 0 },
  sunday_pm:  { short: 'Evening',   long: 'Sunday Evening',  order: 1 },
  wednesday:  { short: 'Wednesday', long: 'Wednesday',       order: 2 },
  special:    { short: 'Special',   long: 'Special Service', order: 3 },
};

const LS = {
  theme:         'choir_theme',
  myPart:        'choir_my_part',
  panelNews:     'choir_panel_news',
  panelCal:      'choir_panel_cal',
  panelDirector: 'choir_panel_director',
  panelLyrics:   'choir_panel_lyrics',
};

/* Value of the single-select filter chip row: '' = All, this = scheduled soon,
   anything else = that tag. */
const UPCOMING_FILTER = '__upcoming';

let SONGS = [];
let CALENDAR = { news: null, director: null, services: [] };
let activeTag = null;
let searchQuery = '';
let expandedLetters = new Set();   /* starts empty — collapsed A–Z is the default view */
let currentAudio = null;
let activePlayer = null;

const root = document.getElementById('app-root');
const backBtn = document.getElementById('back-btn');
const jumpBtn = document.getElementById('jump-songs-btn');
const onlinePill = document.getElementById('online-pill');
const themeBtn = document.getElementById('theme-btn');

init();

async function init() {
  /* Never let the browser put us back where we were on reload or back/forward —
     every view opens at the top, without exception. */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  applyStoredTheme();
  updateOnlinePill();
  window.addEventListener('online', updateOnlinePill);
  window.addEventListener('offline', updateOnlinePill);

  themeBtn.addEventListener('click', toggleTheme);
  backBtn.addEventListener('click', () => { window.location.hash = '#/'; });
  jumpBtn.addEventListener('click', scrollToSongs);

  document.addEventListener('keydown', onGlobalKey);

  const [songsData, calData] = await Promise.all([
    fetchJson('data/songs.json'),
    fetchJson('data/calendar.json'),
  ]);
  SONGS = (songsData && songsData.songs) || [];
  CALENDAR = {
    news: (calData && calData.news) || null,
    director: (calData && calData.director) || null,
    services: (calData && calData.services) || [],
  };

  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed', err));
  }
}

async function fetchJson(path) {
  try {
    const res = await fetch(path, { cache: 'reload' });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Could not load', path, err);
    return null;
  }
}

/* ---------- Theme ---------- */

function applyStoredTheme() {
  let pref = null;
  try { pref = localStorage.getItem(LS.theme); } catch {}
  if (pref === null && window.matchMedia) {
    pref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  setTheme(pref === 'dark');
}

function setTheme(dark) {
  /* On <html>, so the page canvas picks up the dark background too. */
  document.documentElement.classList.toggle('dark-mode', dark);
  themeBtn.innerHTML = dark ? '&#9788;' : '&#9789;';
  /* The banner stays light gray in both themes (see --banner-bg), so the
     browser chrome colour should match it in both themes too. */
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#B5B5B5');
}

function toggleTheme() {
  const dark = !document.documentElement.classList.contains('dark-mode');
  setTheme(dark);
  try { localStorage.setItem(LS.theme, dark ? 'dark' : 'light'); } catch {}
}

function updateOnlinePill() {
  if (!onlinePill) return;
  const on = navigator.onLine;
  onlinePill.textContent = on ? 'Online' : 'Offline';
  onlinePill.classList.toggle('offline', !on);
}

/* ---------- Routing ---------- */

function route() {
  const hash = window.location.hash || '#/';
  const match = hash.match(/^#\/song\/(.+)$/);
  stopCurrentAudio();
  activePlayer = null;

  const song = match ? SONGS.find(s => s.id === decodeURIComponent(match[1])) : null;
  if (song) renderSongDetail(song);
  else renderListView();

  /* One exit point, so no branch can ever forget to reset the scroll. */
  scrollToTop();
}

/* "Jump to songs". Offsets by the sticky bar so the search box isn't left hidden
   underneath it, which plain scrollIntoView({block:'start'}) does. */
function scrollToSongs() {
  const anchor = document.getElementById('songs-anchor');
  if (!anchor) return;
  const bar = document.querySelector('.sticky-bar');
  const barH = bar ? bar.offsetHeight : 0;
  const top = Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - barH);
  const reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    window.scrollTo({ top, behavior: reduceMotion ? 'instant' : 'smooth' });
  } catch {
    window.scrollTo(0, top);
  }
}

/* Jumps to the top instantly. Deliberately not smooth: an animated scroll can be
   cut short by the next render, or by the browser restoring a saved position,
   which is how views used to open part-way down the page. */
function scrollToTop() {
  const jump = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch {
      window.scrollTo(0, 0);   /* older browsers reject behavior:'instant' */
    }
    /* Belt and braces for iOS Safari, where the scrolling element varies. */
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    /* The desktop sidebar is its own scroll container. */
    const side = document.querySelector('.side');
    if (side) side.scrollTop = 0;
  };

  jump();
  /* Again next frame: on first load the browser can restore its saved offset
     after our synchronous call, and async content can still be settling. */
  requestAnimationFrame(jump);
}

/* ================================================================
   List view — News + rolling calendar (left) and songs (right)
   ================================================================ */

function renderListView() {
  backBtn.hidden = true;
  jumpBtn.hidden = false;

  root.innerHTML = `
    <div class="layout two-col">
      <aside class="side">
        ${newsPanelHtml()}
        ${calendarPanelHtml()}
        ${directorPanelHtml()}
      </aside>
      <section class="main-col">
        <div id="songs-anchor"></div>
        <div class="search-wrap">
          <input type="search" class="search-input" id="search-input"
                 placeholder="Search songs, tags or notes&hellip;" value="${escapeAttr(searchQuery)}">
        </div>
        <div id="tag-row-wrap"></div>
        <div class="list-tools">
          <button class="mini-btn" id="expand-all-btn">Expand all</button>
          <button class="mini-btn" id="collapse-all-btn">Collapse all</button>
          <span class="count" id="song-count"></span>
        </div>
        <div class="letter-groups" id="letter-groups"></div>
      </section>
    </div>`;

  wirePanels();

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderTagRow();
    renderSongGroups();
  });

  document.getElementById('expand-all-btn').addEventListener('click', () => {
    visibleLetters().forEach(l => expandedLetters.add(l));
    renderSongGroups();
  });
  document.getElementById('collapse-all-btn').addEventListener('click', () => {
    expandedLetters.clear();
    renderSongGroups();
  });

  renderTagRow();
  renderSongGroups();
}

/* ---------- Choir News panel ---------- */

function newsPanelHtml() {
  const news = CALENDAR.news || {};
  const hasBody = !!(news.html && news.html.trim());
  const collapsed = readPanelState(LS.panelNews) ? '' : 'collapsed';

  let body;
  if (!hasBody) {
    body = `<p class="panel-note">No news from the director yet.</p>`;
  } else {
    body = `
      ${news.subject ? `<div class="news-subject">${escapeHtml(news.subject)}</div>` : ''}
      ${news.date ? `<div class="news-date">${escapeHtml(formatDateLong(news.date))}</div>` : ''}
      <div class="news-body">${sanitizeHtml(news.html)}</div>`;
  }

  return `
    <section class="panel ${collapsed}" data-panel-key="${LS.panelNews}">
      <button class="panel-head" type="button">
        <span class="panel-title">Choir News</span>
        <span class="twisty">${collapsed ? '+' : '&ndash;'}</span>
      </button>
      <div class="panel-body">${body}</div>
    </section>`;
}

/* ---------- Contact The Director panel ---------- */

function directorPanelHtml() {
  const d = CALENDAR.director || {};
  const fields = (d.fields || []).filter(f => f && String(f.value || '').trim());
  const collapsed = readPanelState(LS.panelDirector) ? '' : 'collapsed';

  let body;
  if (!d.name && !fields.length && !d.note) {
    body = `<p class="panel-note">No contact information yet.</p>`;
  } else {
    body = `
      ${d.name ? `<div class="director-name">${escapeHtml(d.name)}</div>` : ''}
      ${fields.length ? `<ul class="contact-list">${fields.map(contactRowHtml).join('')}</ul>` : ''}
      ${d.note ? `<div class="director-note">${escapeHtml(d.note)}</div>` : ''}`;
  }

  return `
    <section class="panel ${collapsed}" data-panel-key="${LS.panelDirector}">
      <button class="panel-head" type="button">
        <span class="panel-title">Contact The Director</span>
        <span class="twisty">${collapsed ? '+' : '&ndash;'}</span>
      </button>
      <div class="panel-body">${body}</div>
    </section>`;
}

/* A field's type decides whether the value becomes a tappable link — worth it on
   a phone, where an email or number you can't tap is just friction. */
function contactRowHtml(field) {
  const label = String(field.label || '').trim();
  const value = String(field.value || '').trim();
  const type = String(field.type || 'text').toLowerCase();

  let valueHtml;
  if (type === 'email') {
    valueHtml = `<a href="mailto:${escapeAttr(value)}">${escapeHtml(value)}</a>`;
  } else if (type === 'phone') {
    valueHtml = `<a href="tel:${escapeAttr(value.replace(/[^\d+]/g, ''))}">${escapeHtml(value)}</a>`;
  } else if (type === 'link' && /^https?:\/\//i.test(value)) {
    valueHtml = `<a href="${escapeAttr(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`;
  } else {
    valueHtml = escapeHtml(value);
  }

  return `<li class="contact-row">
    ${label ? `<span class="contact-label">${escapeHtml(label)}</span>` : ''}
    <span class="contact-value">${valueHtml}</span>
  </li>`;
}

/* ---------- Rolling calendar panel ---------- */

function calendarPanelHtml() {
  const collapsed = readPanelState(LS.panelCal) ? '' : 'collapsed';
  const services = upcomingServices();

  let body;
  if (!services.length) {
    body = `<p class="panel-note">No services scheduled for the next three weeks.</p>`;
  } else {
    body = services.map(serviceHtml).join('');
  }

  return `
    <section class="panel ${collapsed}" data-panel-key="${LS.panelCal}">
      <button class="panel-head" type="button">
        <span class="panel-title">Calendar</span>
        <span class="twisty">${collapsed ? '+' : '&ndash;'}</span>
      </button>
      <div class="panel-body">${body}</div>
    </section>`;
}

/* Current service through the next two weeks. Past dates fall off on their own. */
function upcomingServices() {
  const today = todayStr();
  const cutoff = addDays(today, CALENDAR_DAYS_AHEAD);
  return (CALENDAR.services || [])
    .filter(s => s && s.date && s.date >= today && s.date <= cutoff)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return typeOrder(a.type) - typeOrder(b.type);
    });
}

function serviceHtml(svc) {
  const meta = SERVICE_TYPES[svc.type] || { short: svc.type || 'Service' };
  const label = svc.type === 'special' && svc.specialName ? svc.specialName : meta.short;
  const isToday = svc.date === todayStr();
  const songs = Array.isArray(svc.songs) ? svc.songs : [];

  const rows = songs.length
    ? songs.map(calSongHtml).join('')
    : `<li class="cal-song"><span class="cal-tbd">To Be Determined</span></li>`;

  return `
    <div class="cal-service">
      <div class="cal-date">
        ${escapeHtml(formatDateShort(svc.date))}
        <span class="cal-svc">${escapeHtml(label)}</span>
        ${isToday ? '<span class="cal-today">Today</span>' : ''}
      </div>
      <ul class="cal-songs">${rows}</ul>
    </div>`;
}

function calSongHtml(entry) {
  const e = entry || {};
  const song = e.songId ? SONGS.find(s => s.id === e.songId) : null;
  const title = (song && song.title) || (e.title || '').trim();
  const slot = (e.slot || '').trim();
  const soloist = (e.soloist || '').trim();

  /* A pre-release song shows its title but stays plain text — linking it would be
     a way into a song that is deliberately hidden from the list. */
  const linkable = song && !song.preRelease;
  const titleHtml = !title
    ? `<span class="cal-tbd">To Be Determined</span>`
    : linkable
      ? `<a class="cal-title" href="#/song/${encodeURIComponent(song.id)}">${escapeHtml(title)}</a>`
      : `<span class="cal-title">${escapeHtml(title)}</span>`;

  return `<li class="cal-song">
    ${slot ? `<span class="cal-slot">Slot ${escapeHtml(slot)}</span>` : ''}
    <span class="cal-song-main">${titleHtml}${soloist ? ` <span class="cal-soloist">&mdash; Soloist: ${escapeHtml(soloist)}</span>` : ''}</span>
  </li>`;
}

/* ---------- Panel collapse ---------- */

function readPanelState(key, dflt = true) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? dflt : v === '1';
  } catch { return dflt; }
}

function wirePanels() {
  document.querySelectorAll('.panel').forEach(panel => {
    const head = panel.querySelector('.panel-head');
    const key = panel.dataset.panelKey;
    head.addEventListener('click', () => {
      const nowCollapsed = !panel.classList.contains('collapsed');
      panel.classList.toggle('collapsed', nowCollapsed);
      panel.querySelector('.twisty').innerHTML = nowCollapsed ? '+' : '&ndash;';
      const titleEl = panel.querySelector('.panel-title');
      if (titleEl && titleEl.dataset.open) {
        titleEl.textContent = nowCollapsed ? titleEl.dataset.closed : titleEl.dataset.open;
      }
      try { localStorage.setItem(key, nowCollapsed ? '0' : '1'); } catch {}
    });
  });
}

/* ---------- Songs: tag row + A–Z groups ---------- */

function publicSongs() {
  return SONGS.filter(s => !s.preRelease);
}

function renderTagRow() {
  const wrap = document.getElementById('tag-row-wrap');
  if (!wrap) return;
  const allTags = Array.from(new Set(publicSongs().flatMap(s => s.tags || []))).sort();
  const upcomingKeys = upcomingSongKeys();
  const upcomingCount = publicSongs().filter(s => isUpcomingSong(s, upcomingKeys)).length;

  wrap.innerHTML = `<div class="tag-row">
    <button class="tag-chip ${!activeTag ? 'active' : ''}" data-tag="">All</button>
    <button class="tag-chip upcoming-chip ${activeTag === UPCOMING_FILTER ? 'active' : ''}" data-tag="${UPCOMING_FILTER}">
      &#9834; Upcoming${upcomingCount ? ` (${upcomingCount})` : ''}
    </button>
    ${allTags.map(t => `<button class="tag-chip ${activeTag === t ? 'active' : ''}" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join('')}
  </div>`;

  wrap.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeTag = chip.dataset.tag || null;
      renderTagRow();
      renderSongGroups();
    });
  });
}

/* Songs scheduled in the rolling calendar window. Rotates with the calendar
   automatically, since it reads the same upcomingServices(). */
function upcomingSongKeys() {
  const ids = new Set();
  const titles = new Set();
  upcomingServices().forEach(svc => {
    (svc.songs || []).forEach(entry => {
      if (!entry) return;
      if (entry.songId) ids.add(entry.songId);
      /* Entries typed in free-hand have no songId — fall back to the title. */
      else if (entry.title) titles.add(String(entry.title).trim().toLowerCase());
    });
  });
  return { ids, titles };
}

/* keys is an optional precomputed cache. Guard its shape: passing this straight
   to Array.filter would hand us the element index as the second argument. */
function isUpcomingSong(song, keys) {
  const k = keys && keys.ids ? keys : upcomingSongKeys();
  return k.ids.has(song.id) || k.titles.has(String(song.title).trim().toLowerCase());
}

function matchingSongs() {
  const q = searchQuery.trim().toLowerCase();
  const keys = activeTag === UPCOMING_FILTER ? upcomingSongKeys() : null;

  return publicSongs().filter(s => {
    if (activeTag === UPCOMING_FILTER) {
      if (!isUpcomingSong(s, keys)) return false;
    } else if (activeTag && !(s.tags || []).includes(activeTag)) {
      return false;
    }
    if (!q) return true;
    return s.title.toLowerCase().includes(q)
      || (s.tags || []).some(t => t.toLowerCase().includes(q))
      || (s.notes || '').toLowerCase().includes(q)
      || (s.lyrics || '').toLowerCase().includes(q);
  });
}

function groupByLetter(songs) {
  const groups = new Map();
  songs.slice().sort((a, b) => a.title.localeCompare(b.title)).forEach(song => {
    const letter = letterFor(song.title);
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(song);
  });
  const keys = Array.from(groups.keys()).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });
  return keys.map(k => [k, groups.get(k)]);
}

function letterFor(title) {
  const ch = String(title || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function visibleLetters() {
  return groupByLetter(matchingSongs()).map(([letter]) => letter);
}

async function renderSongGroups() {
  const el = document.getElementById('letter-groups');
  const countEl = document.getElementById('song-count');
  if (!el) return;

  const songs = matchingSongs();
  const groups = groupByLetter(songs);
  const searching = !!searchQuery.trim();

  if (countEl) {
    countEl.textContent = songs.length
      ? `${songs.length} song${songs.length === 1 ? '' : 's'}`
      : '';
  }

  if (!groups.length) {
    let msg;
    if (!publicSongs().length) {
      msg = `<div class="big">No songs yet</div><div>Add songs in the admin tool to get started.</div>`;
    } else if (activeTag === UPCOMING_FILTER && !searching) {
      msg = `<div class="big">Nothing scheduled yet</div><div>Songs added to the calendar for the next three weeks show up here.</div>`;
    } else {
      msg = `<div class="big">No matches</div><div>Try a different search or filter.</div>`;
    }
    el.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  /* A search auto-opens its matches, and so does Upcoming — both are short,
     targeted lists where collapsing would just be an extra tap. */
  const html = await Promise.all(groups.map(async ([letter, list]) => {
    const open = searching || activeTag === UPCOMING_FILTER || expandedLetters.has(letter);
    const rows = await Promise.all(list.map(songRowHtml));
    return `
      <div class="letter-group ${open ? '' : 'collapsed'}" data-letter="${escapeAttr(letter)}">
        <button class="letter-head" type="button">
          <span class="letter">${escapeHtml(letter)}</span>
          <span class="letter-count">${list.length} song${list.length === 1 ? '' : 's'}</span>
          <span class="twisty">${open ? '&ndash;' : '+'}</span>
        </button>
        <div class="letter-body"><ul class="song-list">${rows.join('')}</ul></div>
      </div>`;
  }));

  el.innerHTML = html.join('');

  el.querySelectorAll('.letter-group').forEach(group => {
    group.querySelector('.letter-head').addEventListener('click', () => {
      const letter = group.dataset.letter;
      const nowCollapsed = !group.classList.contains('collapsed');
      group.classList.toggle('collapsed', nowCollapsed);
      group.querySelector('.twisty').innerHTML = nowCollapsed ? '+' : '&ndash;';
      if (nowCollapsed) expandedLetters.delete(letter);
      else expandedLetters.add(letter);
    });
  });
}

async function songRowHtml(song) {
  const cached = await isSongCached(song);
  const trackCount = (song.tracks || []).length;
  const sheetCount = (song.sheetMusic || []).length;
  const bits = [];
  if (trackCount) bits.push(`${trackCount} track${trackCount === 1 ? '' : 's'}`);
  if (sheetCount) bits.push(`${sheetCount} file${sheetCount === 1 ? '' : 's'}`);

  return `<li>
    <a class="song-card" href="#/song/${encodeURIComponent(song.id)}">
      <span class="sc-main">
        <span class="title">
          ${cached ? '<span class="cached-badge" title="Saved for offline">&#10003;</span>' : ''}
          ${escapeHtml(song.title)}
        </span>
        <span class="meta-row">
          ${(song.tags || []).map(t => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}
          ${bits.length ? `<span class="mini-tag file-count">${bits.join(' &middot; ')}</span>` : ''}
        </span>
      </span>
    </a>
  </li>`;
}

/* ================================================================
   Song detail
   ================================================================ */

function renderSongDetail(song) {
  backBtn.hidden = false;
  jumpBtn.hidden = true;

  const tracks = song.tracks || [];
  const sheets = song.sheetMusic || [];
  const links = song.links || [];

  let html = `<div class="layout"><div class="song-detail">
    <div class="song-title-block">
      <h1>${escapeHtml(song.title)}</h1>
      ${song.preRelease ? '<span class="prerelease-badge">Pre-release</span>' : ''}
      ${(song.tags || []).length ? `<div class="meta-row">${(song.tags || []).map(t => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>`;

  if (song.notes) html += `<div class="notes-box">${escapeHtml(song.notes)}</div>`;

  if (tracks.length) {
    const startIndex = preferredTrackIndex(tracks);
    html += `<div class="section-label">Practice tracks</div>
      <div class="part-tabs" id="part-tabs">
        ${tracks.map((t, i) => `
          <button class="part-tab ${i === startIndex ? 'active' : ''}"
                  data-tone="${escapeAttr(toneFor(t.part))}" data-index="${i}">${escapeHtml(t.part)}</button>`).join('')}
      </div>
      <div class="player-card">
        <div class="player-head">
          <div class="player-track-name" id="player-track-name"></div>
          <button class="star-btn" id="my-part-btn" type="button"></button>
          <a class="dl-btn" id="dl-track" href="#" download>&#8681; Download</a>
        </div>
        <div class="player-row">
          <button class="skip-btn" id="rewind-btn" aria-label="Skip back 10 seconds">&minus;10s</button>
          <button class="play-btn" id="play-btn" aria-label="Play">&#9658;</button>
          <button class="skip-btn" id="forward-btn" aria-label="Skip forward 10 seconds">+10s</button>
          <div style="flex:1;min-width:0">
            <div class="seek-bar" id="seek-bar">
              <div class="loop-range" id="loop-range"></div>
              <div class="seek-fill" id="seek-fill"></div>
            </div>
            <div class="time-row"><span id="time-current">0:00</span><span id="time-total">0:00</span></div>
          </div>
        </div>
        <div class="player-tools">
          <span class="tool-label">Speed</span>
          <select class="speed-select" id="speed-select" aria-label="Playback speed">
            <option value="0.5">0.5&times;</option>
            <option value="0.75">0.75&times;</option>
            <option value="0.9">0.9&times;</option>
            <option value="1" selected>1&times;</option>
            <option value="1.1">1.1&times;</option>
            <option value="1.25">1.25&times;</option>
            <option value="1.5">1.5&times;</option>
          </select>
          <span class="tool-label" style="margin-left:0.4rem">Loop</span>
          <button class="loop-btn" id="loop-a" type="button">Set A</button>
          <button class="loop-btn" id="loop-b" type="button">Set B</button>
          <button class="loop-btn" id="loop-clear" type="button" title="Clear loop">&times;</button>
        </div>
      </div>`;
  } else {
    html += `<div class="section-label">Practice tracks</div>
      <div class="no-track-msg">No practice tracks for this song yet.</div>`;
  }

  if (song.lyrics && song.lyrics.trim()) {
    /* Collapsed by default so it doesn't push the sheet music off the screen. */
    const open = readPanelState(LS.panelLyrics, false);
    html += `<div class="section-label">Lyrics</div>
      <section class="panel lyrics-panel ${open ? '' : 'collapsed'}" data-panel-key="${LS.panelLyrics}">
        <button class="panel-head" type="button">
          <span class="panel-title" data-open="Hide lyrics" data-closed="Show lyrics">${open ? 'Hide lyrics' : 'Show lyrics'}</span>
          <span class="twisty">${open ? '&ndash;' : '+'}</span>
        </button>
        <div class="panel-body"><div class="lyrics-body">${escapeHtml(song.lyrics.trim())}</div></div>
      </section>`;
  }

  if (sheets.length) {
    html += `<div class="section-label">Sheet music</div>
      <ul class="file-list" id="sheet-list">
        ${sheets.map((s, i) => {
          /* The name IS the file name without its extension — derived, never stored,
             so the two can't drift apart. */
          const name = sheetName(s.file);
          const ext = fileExt(s.file);
          const kind = ext.toUpperCase() || 'FILE';
          return `<li class="file-row">
            <span class="file-main">
              <a class="file-link" href="${escapeAttr(s.file)}" data-index="${i}"
                 ${isPdf(s.file) ? 'target="_blank" rel="noopener"' : ''}>${escapeHtml(name)}</a>
              <span class="file-kind">${escapeHtml(kind)}</span>
            </span>
            <a class="dl-btn" href="${escapeAttr(s.file)}"
               download="${escapeAttr(ext ? `${name}.${ext}` : name)}">&#8681; Download</a>
          </li>`;
        }).join('')}
      </ul>`;
  }

  if (links.length) {
    html += `<div class="section-label">Reference links</div>
      <ul class="link-list">
        ${links.map(l => `<li class="link-item"><a href="${escapeAttr(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label || l.url)}<span class="arrow">&#8594;</span></a></li>`).join('')}
      </ul>`;
  }

  html += `</div></div>`;

  root.innerHTML = html;

  wirePanels();
  if (tracks.length) setupPlayer(song, tracks);
  if (sheets.length) setupSheetLinks(song, sheets);
}

/* Remembered voice part wins, then an exact name match, then the first track. */
function preferredTrackIndex(tracks) {
  let saved = null;
  try { saved = localStorage.getItem(LS.myPart); } catch {}
  if (!saved) return 0;
  const want = saved.toLowerCase();
  const exact = tracks.findIndex(t => String(t.part || '').toLowerCase() === want);
  if (exact >= 0) return exact;
  const byTone = tracks.findIndex(t => toneFor(t.part) === toneFor(saved) && toneFor(saved) !== 'other');
  return byTone >= 0 ? byTone : 0;
}

function toneFor(part) {
  const p = String(part || '').toLowerCase();
  if (p.includes('demo')) return 'demo';
  if (p.includes('soprano')) return 'soprano';
  if (p.includes('alto')) return 'alto';
  if (p.includes('tenor')) return 'tenor';
  if (p.includes('bass')) return 'bass';
  return 'other';
}

/* ---------- Audio player ---------- */

function setupPlayer(song, tracks) {
  const playBtn = document.getElementById('play-btn');
  const seekBar = document.getElementById('seek-bar');
  const seekFill = document.getElementById('seek-fill');
  const loopRange = document.getElementById('loop-range');
  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');
  const trackNameEl = document.getElementById('player-track-name');
  const myPartBtn = document.getElementById('my-part-btn');
  const dlLink = document.getElementById('dl-track');
  const speedSelect = document.getElementById('speed-select');
  const loopABtn = document.getElementById('loop-a');
  const loopBBtn = document.getElementById('loop-b');
  const loopClearBtn = document.getElementById('loop-clear');
  const tabs = Array.from(document.querySelectorAll('.part-tab'));

  let audio = new Audio();
  let activeIndex = 0;
  let speed = 1;
  let loopA = null;
  let loopB = null;

  function refreshLoopUi() {
    loopABtn.textContent = loopA === null ? 'Set A' : `A ${formatTime(loopA)}`;
    loopBBtn.textContent = loopB === null ? 'Set B' : `B ${formatTime(loopB)}`;
    loopABtn.classList.toggle('set', loopA !== null);
    loopBBtn.classList.toggle('set', loopB !== null);
    const live = loopA !== null && loopB !== null && loopB > loopA;
    loopABtn.classList.toggle('active', live);
    loopBBtn.classList.toggle('active', live);

    if (live && audio.duration) {
      loopRange.style.display = 'block';
      loopRange.style.left = (loopA / audio.duration * 100) + '%';
      loopRange.style.width = ((loopB - loopA) / audio.duration * 100) + '%';
    } else {
      loopRange.style.display = 'none';
    }
  }

  function refreshMyPartBtn() {
    const part = tracks[activeIndex].part;
    let saved = null;
    try { saved = localStorage.getItem(LS.myPart); } catch {}
    const isMine = saved && saved.toLowerCase() === String(part).toLowerCase();
    myPartBtn.classList.toggle('on', !!isMine);
    myPartBtn.innerHTML = isMine ? '&#9733; My part' : '&#9734; My part';
    myPartBtn.title = isMine
      ? `${part} opens by default — click to forget`
      : `Always open ${part} first`;
  }

  function loadTrack(index) {
    activeIndex = index;
    const track = tracks[index];

    audio.pause();
    audio = new Audio(track.file);
    audio.playbackRate = speed;
    currentAudio = audio;

    loopA = loopB = null;
    seekFill.style.width = '0%';
    timeCurrent.textContent = '0:00';
    timeTotal.textContent = '0:00';
    playBtn.innerHTML = '&#9658;';
    trackNameEl.textContent = track.part;
    trackNameEl.classList.remove('err');

    dlLink.href = track.file;
    dlLink.setAttribute('download', downloadName(song.title, track.part, fileExt(track.file)));

    refreshMyPartBtn();
    refreshLoopUi();

    audio.addEventListener('loadedmetadata', () => {
      timeTotal.textContent = formatTime(audio.duration);
      refreshLoopUi();
    });
    audio.addEventListener('timeupdate', () => {
      if (loopA !== null && loopB !== null && loopB > loopA && audio.currentTime >= loopB) {
        audio.currentTime = loopA;
      }
      if (audio.duration) {
        seekFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
        timeCurrent.textContent = formatTime(audio.currentTime);
      }
    });
    audio.addEventListener('ended', () => { playBtn.innerHTML = '&#9658;'; });
    audio.addEventListener('error', () => {
      trackNameEl.textContent = `${track.part} — file not found`;
      trackNameEl.classList.add('err');
    });
  }

  function toggle() {
    if (audio.paused) {
      audio.play().then(() => {
        playBtn.innerHTML = '&#10074;&#10074;';
      }).catch(() => {
        trackNameEl.textContent = `${tracks[activeIndex].part} — could not play (file missing?)`;
        trackNameEl.classList.add('err');
      });
    } else {
      audio.pause();
      playBtn.innerHTML = '&#9658;';
    }
  }

  loadTrack(preferredTrackIndex(tracks));
  activePlayer = { toggle };

  playBtn.addEventListener('click', toggle);
  document.getElementById('rewind-btn').addEventListener('click', () => {
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  });
  document.getElementById('forward-btn').addEventListener('click', () => {
    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
  });

  seekBar.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = seekBar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  });

  speedSelect.addEventListener('change', () => {
    speed = parseFloat(speedSelect.value) || 1;
    audio.playbackRate = speed;
  });

  loopABtn.addEventListener('click', () => {
    loopA = audio.currentTime;
    if (loopB !== null && loopB <= loopA) loopB = null;
    refreshLoopUi();
  });
  loopBBtn.addEventListener('click', () => {
    loopB = audio.currentTime;
    if (loopA !== null && loopB <= loopA) loopA = null;
    refreshLoopUi();
  });
  loopClearBtn.addEventListener('click', () => {
    loopA = loopB = null;
    refreshLoopUi();
  });

  myPartBtn.addEventListener('click', () => {
    const part = tracks[activeIndex].part;
    let saved = null;
    try { saved = localStorage.getItem(LS.myPart); } catch {}
    const isMine = saved && saved.toLowerCase() === String(part).toLowerCase();
    try {
      if (isMine) localStorage.removeItem(LS.myPart);
      else localStorage.setItem(LS.myPart, part);
    } catch {}
    refreshMyPartBtn();
    showToast(isMine ? 'Cleared your default part.' : `${part} will open first from now on.`);
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTrack(parseInt(tab.dataset.index, 10));
    });
  });
}

function onGlobalKey(e) {
  if (e.code !== 'Space' || !activePlayer) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return;
  e.preventDefault();
  activePlayer.toggle();
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/* ---------- Sheet music: images open a lightbox, PDFs open in a tab ---------- */

function setupSheetLinks(song, sheets) {
  document.querySelectorAll('#sheet-list .file-link').forEach(link => {
    const index = parseInt(link.dataset.index, 10);
    if (isPdf(sheets[index].file)) return;   /* let the browser open it */
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(sheets.filter(s => !isPdf(s.file)),
                   sheets.filter(s => !isPdf(s.file)).indexOf(sheets[index]));
    });
  });
}

function openLightbox(sheets, index) {
  if (!sheets.length) return;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';

  function render() {
    const s = sheets[index];
    const hide = sheets.length < 2 ? 'style="visibility:hidden"' : '';
    overlay.innerHTML = `
      <button class="lightbox-close" aria-label="Close">&times;</button>
      <img src="${escapeAttr(s.file)}" alt="${escapeAttr(sheetName(s.file))}">
      <div class="lightbox-nav">
        <button id="lb-prev" ${hide}>&larr; Prev</button>
        <button id="lb-next" ${hide}>Next &rarr;</button>
      </div>`;
    overlay.querySelector('.lightbox-close').addEventListener('click', close);
    overlay.querySelector('#lb-prev').addEventListener('click', () => { index = (index - 1 + sheets.length) % sheets.length; render(); });
    overlay.querySelector('#lb-next').addEventListener('click', () => { index = (index + 1) % sheets.length; render(); });
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') { index = (index - 1 + sheets.length) % sheets.length; render(); }
    if (e.key === 'ArrowRight') { index = (index + 1) % sheets.length; render(); }
  }

  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  render();
  document.body.appendChild(overlay);
}

/* ---------- Offline save-per-song ---------- */

function songAssetUrls(song) {
  return [
    ...(song.tracks || []).map(t => t.file),
    ...(song.sheetMusic || []).map(s => s.file),
  ];
}

async function isSongCached(song) {
  if (!('caches' in window)) return false;
  const urls = songAssetUrls(song);
  if (!urls.length) return false;
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const results = await Promise.all(urls.map(u => cache.match(u)));
    return results.every(Boolean);
  } catch {
    return false;
  }
}

/* ================================================================
   HTML sanitizer — Choir News is pasted from email, so it is
   re-cleaned on render as well as on save.
   ================================================================ */

const SANITIZE_ALLOW = new Set(['P','BR','B','STRONG','I','EM','U','UL','OL','LI','A','H3','H4','BLOCKQUOTE']);
const SANITIZE_RENAME = { DIV: 'P', H1: 'H3', H2: 'H3', H5: 'H4', H6: 'H4', STRIKE: 'EM', S: 'EM' };
const SANITIZE_DROP = 'script,style,iframe,object,embed,link,meta,img,svg,form,input,button,select,textarea,noscript,title,base';

function sanitizeHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString('<body><div id="sanitize-root"></div></body>', 'text/html');
  const host = doc.getElementById('sanitize-root');
  host.innerHTML = String(html);

  host.querySelectorAll(SANITIZE_DROP).forEach(n => n.remove());

  const walker = doc.createTreeWalker(host, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach(c => c.remove());

  sanitizeChildren(host);
  return host.innerHTML;
}

function sanitizeChildren(parent) {
  Array.from(parent.children).forEach(child => {
    sanitizeChildren(child);
    const tag = child.tagName;

    if (SANITIZE_ALLOW.has(tag)) {
      stripAttributes(child);
      return;
    }

    const renameTo = SANITIZE_RENAME[tag];
    if (renameTo) {
      const rep = child.ownerDocument.createElement(renameTo);
      while (child.firstChild) rep.appendChild(child.firstChild);
      child.replaceWith(rep);
      stripAttributes(rep);
      return;
    }

    /* Unknown wrapper (span, font, table cells, Word junk): keep the text, drop the tag. */
    const frag = child.ownerDocument.createDocumentFragment();
    while (child.firstChild) frag.appendChild(child.firstChild);
    child.replaceWith(frag);
  });
}

function stripAttributes(el) {
  const href = el.tagName === 'A' ? el.getAttribute('href') : null;
  Array.from(el.attributes).forEach(a => el.removeAttribute(a.name));
  if (el.tagName === 'A') {
    if (href && /^(https?:|mailto:|tel:)/i.test(href.trim())) {
      el.setAttribute('href', href.trim());
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

/* ---------- Dates ---------- */

function pad2(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/* Parsed as local time on purpose — 'new Date("2026-08-16")' is UTC and can shift a day. */
function parseLocalDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDateShort(dateStr) {
  const d = parseLocalDate(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateLong(dateStr) {
  const d = parseLocalDate(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function typeOrder(type) {
  const meta = SERVICE_TYPES[type];
  return meta ? meta.order : 99;
}

/* ---------- Files ---------- */

function isPdf(file) { return fileExt(file) === 'pdf'; }

function fileExt(file) {
  const name = baseName(file);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

function baseName(file) {
  const parts = String(file || '').split('/');
  return parts[parts.length - 1] || '';
}

/* A sheet music entry's display name: its file name without the extension. */
function sheetName(file) {
  const base = baseName(file);
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(0, i) : base;
}

function downloadName(songTitle, label, ext) {
  const clean = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  const title = clean(songTitle);
  const lbl = clean(label);
  let base;
  if (!lbl) base = title;
  else if (!title) base = lbl;
  /* Labels are often already "Music - <song title>" — don't say it twice. */
  else if (lbl.toLowerCase().includes(title.toLowerCase())) base = lbl;
  else base = `${title} - ${lbl}`;
  return ext ? `${base}.${ext}` : base;
}

/* ---------- Misc ---------- */

function formatTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function escapeAttr(str) { return escapeHtml(str); }

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}
