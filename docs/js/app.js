/* Choir Materials — app logic
   Hash-routed single page app. No build step, no framework.
   Data comes from data/songs.json. Files come from audio/ and images/.
*/

const APP_CACHE = 'choir-materials-shell-v1';
const MEDIA_CACHE = 'choir-materials-media-v1';

let SONGS = [];
let activeTag = null;
let currentAudio = null;
let currentTrackKey = null;

const root = document.getElementById('app-root');
const headerBrand = document.getElementById('header-brand');
const backBtn = document.getElementById('back-btn');
const onlinePill = document.getElementById('online-pill');

init();

async function init() {
  updateOnlinePill();
  window.addEventListener('online', updateOnlinePill);
  window.addEventListener('offline', updateOnlinePill);

  try {
    const res = await fetch('data/songs.json');
    const data = await res.json();
    SONGS = data.songs || [];
  } catch (err) {
    SONGS = [];
    console.error('Could not load songs.json', err);
  }

  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed', err));
  }
}

function updateOnlinePill() {
  if (!onlinePill) return;
  if (navigator.onLine) {
    onlinePill.textContent = 'Online';
    onlinePill.classList.remove('offline');
  } else {
    onlinePill.textContent = 'Offline';
    onlinePill.classList.add('offline');
  }
}

function route() {
  const hash = window.location.hash || '#/';
  const match = hash.match(/^#\/song\/(.+)$/);
  stopCurrentAudio();
  if (match) {
    const song = SONGS.find(s => s.id === decodeURIComponent(match[1]));
    if (song) {
      renderSongDetail(song);
      return;
    }
  }
  renderSongList();
}

/* ---------- List page ---------- */

function renderSongList() {
  backBtn.style.display = 'none';
  headerBrand.innerHTML = '<span class="mark">&#9834;</span> Choir Materials';

  const allTags = Array.from(new Set(SONGS.flatMap(s => s.tags || []))).sort();

  const filtered = SONGS.filter(s => !activeTag || (s.tags || []).includes(activeTag));

  let html = '';
  html += `<div class="search-wrap">
    <input type="search" class="search-input" id="search-input" placeholder="Search songs or composers&hellip;" />
  </div>`;

  if (allTags.length) {
    html += '<div class="tag-row">';
    html += `<button class="tag-chip ${!activeTag ? 'active' : ''}" data-tag="">All</button>`;
    allTags.forEach(t => {
      html += `<button class="tag-chip ${activeTag === t ? 'active' : ''}" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`;
    });
    html += '</div>';
  }

  if (!filtered.length) {
    html += `<div class="empty-state">
      <div class="big">No songs yet</div>
      <div>Add an entry to data/songs.json to get started.</div>
    </div>`;
  } else {
    html += '<ul class="song-list" id="song-list"></ul>';
  }

  root.innerHTML = html;

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => renderFilteredList(searchInput.value));

  document.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeTag = chip.dataset.tag || null;
      renderSongList();
    });
  });

  renderFilteredList('');
}

async function renderFilteredList(query) {
  const listEl = document.getElementById('song-list');
  if (!listEl) return;

  const q = query.trim().toLowerCase();
  let filtered = SONGS.filter(s => !activeTag || (s.tags || []).includes(activeTag));
  if (q) {
    filtered = filtered.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.composer || '').toLowerCase().includes(q)
    );
  }

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="big">No matches</div><div>Try a different search.</div></div>`;
    return;
  }

  const rows = await Promise.all(filtered.map(async song => {
    const cached = await isSongCached(song);
    return `<li>
      <a class="song-card" href="#/song/${encodeURIComponent(song.id)}">
        <div class="title">${cached ? '<span class="cached-badge" title="Saved for offline">&#10003;</span>' : ''}${escapeHtml(song.title)}</div>
        ${song.composer ? `<div class="composer">${escapeHtml(song.composer)}</div>` : ''}
        <div class="meta-row">
          ${(song.tags || []).map(t => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}
          ${song.tracks && song.tracks.length ? `<span class="mini-tag">${song.tracks.length} track${song.tracks.length > 1 ? 's' : ''}</span>` : ''}
          ${song.sheetMusic && song.sheetMusic.length ? `<span class="mini-tag">${song.sheetMusic.length} page${song.sheetMusic.length > 1 ? 's' : ''}</span>` : ''}
        </div>
      </a>
    </li>`;
  }));

  listEl.innerHTML = rows.join('');
}

/* ---------- Song detail page ---------- */

function renderSongDetail(song) {
  backBtn.style.display = 'block';
  headerBrand.textContent = song.title;

  const tracks = song.tracks || [];
  const sheets = song.sheetMusic || [];
  const links = song.links || [];

  let html = `<div class="song-detail">
    <div class="song-title-block">
      <h1>${escapeHtml(song.title)}</h1>
      ${song.composer ? `<div class="composer">${escapeHtml(song.composer)}</div>` : ''}
    </div>`;

  if (song.notes) {
    html += `<div class="notes-box">${escapeHtml(song.notes)}</div>`;
  }

  if (tracks.length) {
    html += `<div class="section-label">Practice tracks</div>
      <div class="part-tabs" id="part-tabs">
        ${tracks.map((t, i) => `<button class="part-tab ${i === 0 ? 'active' : ''}" data-part="${escapeAttr(t.part)}" data-index="${i}">${escapeHtml(t.part)}</button>`).join('')}
      </div>
      <div class="player-card">
        <div class="player-track-name" id="player-track-name">${escapeHtml(tracks[0].part)}</div>
        <div class="player-row">
          <button class="skip-btn" id="rewind-btn" aria-label="Skip back 10 seconds">−10s</button>
          <button class="play-btn" id="play-btn" aria-label="Play">&#9658;</button>
          <button class="skip-btn" id="forward-btn" aria-label="Skip forward 10 seconds">+10s</button>
          <div style="flex:1">
            <div class="seek-bar" id="seek-bar"><div class="seek-fill" id="seek-fill"></div></div>
            <div class="time-row"><span id="time-current">0:00</span><span id="time-total">0:00</span></div>
          </div>
        </div>
      </div>`;
  }

  if (sheets.length) {
    html += `<div class="section-label">Sheet music</div>
      <div class="sheet-grid" id="sheet-grid">
        ${sheets.map((s, i) => `
          <a class="sheet-thumb${isPdf(s.file) ? ' sheet-thumb-pdf' : ''}" href="#" data-index="${i}">
            ${isPdf(s.file)
              ? `<div class="pdf-badge">PDF</div>`
              : `<img src="${escapeAttr(s.file)}" alt="${escapeAttr(s.label || ('Page ' + (i + 1)))}" loading="lazy" />`}
            <div class="label">${escapeHtml(s.label || ('Page ' + (i + 1)))}</div>
          </a>`).join('')}
      </div>`;
  }

  if (links.length) {
    html += `<div class="section-label">Reference links</div>
      <ul class="link-list">
        ${links.map(l => `<li class="link-item"><a href="${escapeAttr(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label || l.url)}<span class="arrow">&#8594;</span></a></li>`).join('')}
      </ul>`;
  }

  html += `<div class="offline-row">
      <button class="save-offline-btn" id="save-offline-btn">Save this song for offline</button>
    </div>
    <div class="save-status" id="save-status"></div>
  </div>`;

  root.innerHTML = html;

  if (tracks.length) setupPlayer(song, tracks);
  if (sheets.length) setupLightbox(song, sheets);
  setupOfflineButton(song);
}

/* ---------- Audio player ---------- */

function setupPlayer(song, tracks) {
  const playBtn = document.getElementById('play-btn');
  const rewindBtn = document.getElementById('rewind-btn');
  const forwardBtn = document.getElementById('forward-btn');
  const seekBar = document.getElementById('seek-bar');
  const seekFill = document.getElementById('seek-fill');
  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');
  const trackNameEl = document.getElementById('player-track-name');
  const tabs = document.querySelectorAll('.part-tab');

  let audio = new Audio();
  let activeIndex = 0;

  function loadTrack(index) {
    const track = tracks[index];
    activeIndex = index;
    audio.pause();
    audio = new Audio(track.file);
    currentAudio = audio;
    currentTrackKey = song.id + ':' + track.part;
    trackNameEl.textContent = track.part;
    seekFill.style.width = '0%';
    timeCurrent.textContent = '0:00';
    timeTotal.textContent = '0:00';
    playBtn.innerHTML = '&#9658;';

    audio.addEventListener('loadedmetadata', () => {
      timeTotal.textContent = formatTime(audio.duration);
    });
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) {
        seekFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
        timeCurrent.textContent = formatTime(audio.currentTime);
      }
    });
    audio.addEventListener('ended', () => {
      playBtn.innerHTML = '&#9658;';
    });
    audio.addEventListener('error', () => {
      trackNameEl.textContent = track.part + ' — file not found';
    });
  }

  loadTrack(0);

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().catch(() => {
        trackNameEl.textContent = tracks[activeIndex].part + ' — could not play (file missing?)';
      });
      playBtn.innerHTML = '&#10074;&#10074;';
    } else {
      audio.pause();
      playBtn.innerHTML = '&#9658;';
    }
  });

  rewindBtn.addEventListener('click', () => {
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  });

  forwardBtn.addEventListener('click', () => {
    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
  });

  seekBar.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = seekBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTrack(parseInt(tab.dataset.index, 10));
    });
  });
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/* ---------- Sheet music lightbox ---------- */

function setupLightbox(song, sheets) {
  const thumbs = document.querySelectorAll('.sheet-thumb');
  thumbs.forEach(thumb => {
    thumb.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(sheets, parseInt(thumb.dataset.index, 10));
    });
  });
}

function openLightbox(sheets, index) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';

  function render() {
    const s = sheets[index];
    const nav = sheets.length < 2 ? '' : `
      <div class="lightbox-nav">
        <button id="lb-prev">&larr; Prev</button>
        <button id="lb-next">Next &rarr;</button>
      </div>`;
    overlay.innerHTML = `
      <button class="lightbox-close" aria-label="Close">&times;</button>
      ${isPdf(s.file)
        ? `<iframe class="pdf-viewer" src="${escapeAttr(s.file)}" title="${escapeAttr(s.label || 'Sheet music')}"></iframe>`
        : `<img src="${escapeAttr(s.file)}" alt="${escapeAttr(s.label || '')}" />`}
      ${nav}`;
    overlay.querySelector('.lightbox-close').addEventListener('click', close);
    overlay.querySelector('#lb-prev').addEventListener('click', () => { index = (index - 1 + sheets.length) % sheets.length; render(); });
    overlay.querySelector('#lb-next').addEventListener('click', () => { index = (index + 1) % sheets.length; render(); });
  }

  function close() {
    document.body.removeChild(overlay);
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
  const urls = [];
  (song.tracks || []).forEach(t => urls.push(t.file));
  (song.sheetMusic || []).forEach(s => urls.push(s.file));
  return urls;
}

async function isSongCached(song) {
  if (!('caches' in window)) return false;
  const urls = songAssetUrls(song);
  if (!urls.length) return false;
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const results = await Promise.all(urls.map(u => cache.match(u)));
    return results.every(r => !!r);
  } catch {
    return false;
  }
}

function setupOfflineButton(song) {
  const btn = document.getElementById('save-offline-btn');
  const status = document.getElementById('save-status');
  if (!btn) return;

  isSongCached(song).then(cached => {
    if (cached) {
      btn.textContent = 'Saved for offline';
      btn.classList.add('saved');
    }
  });

  btn.addEventListener('click', async () => {
    if (!('caches' in window)) {
      status.textContent = 'Offline storage is not supported in this browser.';
      return;
    }
    const urls = songAssetUrls(song);
    if (!urls.length) {
      status.textContent = 'Nothing to save for this song.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Saving…';
    let done = 0;
    try {
      const cache = await caches.open(MEDIA_CACHE);
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res.ok) {
            await cache.put(url, res.clone());
          }
        } catch (err) {
          console.error('Failed to cache', url, err);
        }
        done++;
        status.textContent = `Saved ${done} of ${urls.length} files…`;
      }
      btn.textContent = 'Saved for offline';
      btn.classList.add('saved');
      status.textContent = `All ${urls.length} files available offline.`;
    } catch (err) {
      status.textContent = 'Something went wrong saving files.';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- Utilities ---------- */

function isPdf(file) {
  return (file || '').toLowerCase().endsWith('.pdf');
}

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

function escapeAttr(str) {
  return escapeHtml(str);
}

backBtn.addEventListener('click', () => {
  window.location.hash = '#/';
});
