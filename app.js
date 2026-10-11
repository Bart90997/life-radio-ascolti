'use strict';

/* =========================================================================
   Li.Fe. Radio — Ascolti & Metadati  (versione GitHub Pages)
   -------------------------------------------------------------------------
   - I metadati live (brano in onda + ascoltatori adesso) sono letti
     DIRETTAMENTE dal browser: l'endpoint della radio permette il CORS.
   - Il grafico giornaliero legge il file statico data/listeners.json,
     che viene aggiornato ogni ora da GitHub Actions (record.yml).
   - Nessun server, nessun cron da gestire: ci pensa GitHub.
   ========================================================================= */

const METADATA_URL = 'https://sr14.inmystream.it:2020/json/stream/scuola';
const DATA_URL = 'data/listeners.json';
const REFRESH_SECONDS = 20;        // aggiornamento metadati live
const DATA_REFRESH_MS = 5 * 60 * 1000; // ricontrolla il file dati ogni 5 min

const DEFAULT_COVER =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" fill="#012657"/>
  <circle cx="120" cy="120" r="76" fill="#0185C7" opacity="0.24"/>
  <path d="M92 72h72v96H92z" fill="#0185C7" opacity="0.9"/>
  <circle cx="92" cy="164" r="22" fill="#fff" opacity="0.9"/>
  <circle cx="164" cy="164" r="22" fill="#fff" opacity="0.9"/>
  <text x="120" y="42" text-anchor="middle" fill="#fff" font-family="Arial" font-size="18" font-weight="700">LI.FE. RADIO</text>
</svg>`);

let refreshTimer = null;
let countdownTimer = null;
let secondsToNextRefresh = 0;
let listenersChart = null;
let currentDay = null;
let dbCache = null;

const els = {
  connectionStatus: document.getElementById('connectionStatus'),
  connectionText: document.getElementById('connectionText'),
  refreshLabel: document.getElementById('refreshLabel'),
  coverArt: document.getElementById('coverArt'),
  songTitle: document.getElementById('songTitle'),
  songArtist: document.getElementById('songArtist'),
  serverName: document.getElementById('serverName'),
  bitrate: document.getElementById('bitrate'),
  format: document.getElementById('format'),
  connections: document.getElementById('connections'),
  lastUpdate: document.getElementById('lastUpdate'),
  historyList: document.getElementById('historyList'),
  liveListeners: document.getElementById('liveListeners'),
  liveListenersSub: document.getElementById('liveListenersSub'),
  lastRecordedLabel: document.getElementById('lastRecordedLabel'),
  statPeak: document.getElementById('statPeak'),
  statAvg: document.getElementById('statAvg'),
  statSamples: document.getElementById('statSamples'),
  refreshDataBtn: document.getElementById('refreshDataBtn'),
  daySelect: document.getElementById('daySelect'),
  dayPicker: document.getElementById('dayPicker'),
  chartEmpty: document.getElementById('chartEmpty'),
  chartCaption: document.getElementById('chartCaption'),
  demoBadge: document.getElementById('demoBadge'),
};

/* ------------------------------- Utils ---------------------------------- */
function setStatus(isOnline, text) {
  if (!els.connectionStatus) return;
  els.connectionStatus.classList.toggle('offline', !isOnline);
  els.connectionText.textContent = text;
}

function parseNowPlaying(value = '') {
  const clean = String(value).replace(/\s+/g, ' ').trim();
  if (!clean) return { artist: 'Li.Fe. Radio', title: 'Nessun metadato disponibile', raw: '' };
  const separators = [' - ', ' – ', ' — ', ' | '];
  for (const sep of separators) {
    if (clean.includes(sep)) {
      const [artist, ...rest] = clean.split(sep);
      return {
        artist: artist.trim() || 'Artista non indicato',
        title: rest.join(sep).trim() || clean,
        raw: clean,
      };
    }
  }
  return { artist: 'Artista non indicato', title: clean, raw: clean };
}

function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
}

function formatHourLabel(hour) { return String(hour).padStart(2, '0') + ':00'; }

function formatDateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  }).format(date);
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* --------------------------- Metadati live ------------------------------- */
// Prova prima la connessione diretta (porta 2020). Se la rete blocca le
// porte non standard, usa un proxy su porta 443 come ripiego.
async function fetchMetadataRaw() {
  try {
    const r = await fetch(METADATA_URL, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch (e) { /* prova il fallback */ }

  const r2 = await fetch('https://r.jina.ai/' + METADATA_URL, { cache: 'no-store' });
  if (!r2.ok) throw new Error('Proxy HTTP ' + r2.status);
  const text = await r2.text();
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Risposta proxy non valida');
  return JSON.parse(text.slice(start));
}

async function fetchMetadata() {
  setStatus(true, 'Aggiornamento...');
  try {
    const data = await fetchMetadataRaw();
    renderMetadata(data);
    setStatus(true, 'Online');
    resetCountdown();
  } catch (error) {
    setStatus(false, 'Errore metadati');
    if (els.connectionText) els.connectionText.title = error.message;
  }
}

function renderMetadata(data) {
  const parsed = parseNowPlaying(data.nowplaying);
  els.coverArt.src = data.coverart || DEFAULT_COVER;
  els.coverArt.onerror = () => { els.coverArt.src = DEFAULT_COVER; };
  els.songTitle.textContent = parsed.title;
  els.songArtist.textContent = parsed.artist;
  els.serverName.textContent = data.servername || '--';
  els.bitrate.textContent = data.bitrate ? `${data.bitrate} kbps` : '--';
  els.format.textContent = data.format || '--';

  const liveCount = Number(data.connections);
  const hasLive = Number.isFinite(liveCount);
  els.connections.textContent = hasLive ? liveCount : '--';
  els.lastUpdate.textContent = formatDateTime();

  if (hasLive) {
    els.liveListeners.textContent = liveCount;
    els.liveListenersSub.textContent = `Rilevato alle ${formatDateTime()}`;
  }

  const history = Array.isArray(data.trackhistory) ? data.trackhistory : [];
  const covers = Array.isArray(data.covers) ? data.covers : [];
  els.historyList.innerHTML = '';
  history.slice(0, 6).forEach((track, index) => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    const span = document.createElement('span');
    img.src = covers[index] || DEFAULT_COVER;
    img.onerror = () => { img.src = DEFAULT_COVER; };
    span.textContent = track;
    li.append(img, span);
    els.historyList.appendChild(li);
  });
  if (!history.length) {
    const li = document.createElement('li');
    li.innerHTML = `<img src="${DEFAULT_COVER}" alt=""><span>Nessuno storico disponibile</span></li>`;
    els.historyList.appendChild(li);
  }
}

/* ------------------------- Polling metadati ------------------------------ */
function resetCountdown() { secondsToNextRefresh = REFRESH_SECONDS; updateRefreshLabel(); }
function updateRefreshLabel() { if (els.refreshLabel) els.refreshLabel.textContent = `${secondsToNextRefresh}s`; }
function startPolling() {
  stopPolling();
  refreshTimer = setInterval(fetchMetadata, REFRESH_SECONDS * 1000);
  countdownTimer = setInterval(() => {
    secondsToNextRefresh = Math.max(0, secondsToNextRefresh - 1);
    updateRefreshLabel();
  }, 1000);
  resetCountdown();
}
function stopPolling() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  refreshTimer = null;
  countdownTimer = null;
}

/* --------------------------- Dati ascoltatori ---------------------------- */
async function loadDb(force) {
  if (dbCache && !force) return dbCache;
  const res = await fetch(DATA_URL + '?_=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (!j || typeof j !== 'object') throw new Error('Formato dati non valido');
  if (!j.days || typeof j.days !== 'object') j.days = {};
  dbCache = j;
  return j;
}

function buildDaySeries(db, date) {
  const hoursData = (db.days[date] && db.days[date].hours) || {};
  const hours = [];
  const values = [];
  for (let h = 0; h < 24; h++) {
    const has = Object.prototype.hasOwnProperty.call(hoursData, String(h));
    const v = has ? Number(hoursData[String(h)]) : null;
    hours.push({ hour: h, connections: Number.isFinite(v) ? v : null });
    if (Number.isFinite(v)) values.push(v);
  }
  const peak = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  const average = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0;
  return {
    date,
    hours,
    peak,
    min,
    average,
    samples: values.length,
    updatedAt: (db.days[date] && db.days[date].updatedAt) || null,
  };
}

async function refreshListenersData(force) {
  let db;
  try {
    db = await loadDb(force);
  } catch (e) {
    els.chartCaption.textContent = 'Impossibile leggere data/listeners.json: ' + e.message;
    return;
  }

  const dates = Object.keys(db.days).sort().reverse();
  const today = todayISO();
  populateDaySelect(dates, today);
  if (els.demoBadge) els.demoBadge.style.display = db.demo ? 'inline-flex' : 'none';

  // ultimo campione
  if (db.last) {
    els.lastRecordedLabel.textContent = `${formatHourLabel(db.last.hour)} - ${db.last.connections}`;
  } else {
    els.lastRecordedLabel.textContent = 'nessuna';
  }

  await loadDay(currentDay || today);
}

function populateDaySelect(dates, today) {
  const set = new Set(dates);
  set.add(today);
  const sorted = Array.from(set).sort().reverse();
  const previous = currentDay;
  els.daySelect.innerHTML = '';
  sorted.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d === today ? `Oggi (${d})` : formatDateLabel(d);
    els.daySelect.appendChild(opt);
  });
  if (previous && set.has(previous)) els.daySelect.value = previous;
  else els.daySelect.value = today;
}

async function loadDay(date) {
  currentDay = date;
  els.dayPicker.value = date;
  try {
    const db = await loadDb(false);
    renderChart(buildDaySeries(db, date));
  } catch (e) {
    renderChart({ date, hours: [], peak: 0, average: 0, samples: 0 });
    els.chartCaption.textContent = 'Errore nel caricamento dei dati: ' + e.message;
  }
}

/* ------------------------------ Grafico ---------------------------------- */
function renderChart(series) {
  const labels = series.hours.map((h) => formatHourLabel(h.hour));
  const data = series.hours.map((h) => h.connections);

  els.statPeak.textContent = series.samples ? series.peak : '--';
  els.statAvg.textContent = series.samples ? series.average : '--';
  els.statSamples.textContent = series.samples;

  const hasData = series.samples > 0;
  els.chartEmpty.classList.toggle('show', !hasData);

  els.chartCaption.textContent = hasData
    ? `${formatDateLabel(series.date)} - ${series.samples} rilevazioni orarie. Picco ${series.peak}, media ${series.average} ascoltatori.`
    : `Nessuna rilevazione per il ${formatDateLabel(series.date)}. GitHub registra automaticamente ogni ora.`;

  const ctx = document.getElementById('listenersChart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 340);
  gradient.addColorStop(0, 'rgba(1,133,199,0.95)');
  gradient.addColorStop(1, 'rgba(1,133,199,0.25)');

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Ascoltatori',
        data,
        backgroundColor: gradient,
        borderColor: '#0185C7',
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 34,
        spanGaps: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#012657',
          borderColor: 'rgba(255,255,255,0.15)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            label: (item) => (item.parsed.y === null ? 'nessun dato' : `${item.parsed.y} ascoltatori`),
          },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.55)', font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.07)' }, ticks: { color: 'rgba(255,255,255,0.55)', precision: 0, font: { size: 11 } } },
      },
    },
  };

  if (listenersChart) {
    listenersChart.data.labels = labels;
    listenersChart.data.datasets[0].data = data;
    listenersChart.data.datasets[0].backgroundColor = gradient;
    listenersChart.update();
  } else {
    listenersChart = new Chart(ctx, config);
  }
}

/* ------------------------------- Eventi ---------------------------------- */
els.refreshDataBtn.addEventListener('click', async () => {
  els.refreshDataBtn.disabled = true;
  els.refreshDataBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aggiorno...';
  await refreshListenersData(true);
  els.refreshDataBtn.disabled = false;
  els.refreshDataBtn.innerHTML = '<i class="fas fa-rotate"></i> Aggiorna dati';
});
els.daySelect.addEventListener('change', () => loadDay(els.daySelect.value));
els.dayPicker.addEventListener('change', () => {
  if (els.dayPicker.value) { currentDay = els.dayPicker.value; loadDay(els.dayPicker.value); }
});

/* ------------------------------- Avvio ----------------------------------- */
fetchMetadata();
startPolling();
refreshListenersData(false);
setInterval(() => refreshListenersData(true), DATA_REFRESH_MS);
