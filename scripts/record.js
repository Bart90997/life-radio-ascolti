#!/usr/bin/env node
'use strict';

/* =========================================================================
   Li.Fe. Radio — Registrazione ascoltatori (gira su GitHub Actions)
   -------------------------------------------------------------------------
   Questo script viene eseguito da GitHub Actions una volta ogni ora.
   Non ha bisogno di alcun server: legge i metadati della radio direttamente
   dalla porta 2020 (i runner GitHub hanno accesso a internet completo),
   prende il numero di ascoltatori e lo salva in data/listeners.json.

   Lo script NON fa commit da solo: ci pensa il workflow (record.yml).
   ========================================================================= */

const fs = require('fs');
const path = require('path');

const METADATA_URL =
  process.env.METADATA_URL || 'https://sr14.inmystream.it:2020/json/stream/scuola';
const TIMEZONE = process.env.TZ_NAME || 'Europe/Rome';
const DATA_FILE = path.join(__dirname, '..', 'data', 'listeners.json');
const RETRIES = 4;

/* --------------------------- Data/ora locale ---------------------------- */

function zonedNow(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
  };
}

function offsetString(date = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      timeZoneName: 'longOffset',
    });
    const part = fmt.formatToParts(date).find((p) => p.type === 'timeZoneName');
    const m = part && part.value.match(/GMT([+-]\d{2}:\d{2})/);
    return m ? m[1] : '+00:00';
  } catch (e) {
    return '+00:00';
  }
}

function localIso(date = new Date()) {
  const p = zonedNow(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.date}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${offsetString(date)}`;
}

/* ------------------------------ Archivio -------------------------------- */

function loadDb() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') throw new Error('formato non valido');
    if (!j.days || typeof j.days !== 'object' || Array.isArray(j.days)) j.days = {};
    if (!('last' in j)) j.last = null;
    if (!('demo' in j)) j.demo = false;
    return j;
  } catch (e) {
    return { days: {}, last: null, demo: false };
  }
}

function saveDb(db) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

/* ------------------------------ Metadati -------------------------------- */

async function fetchMetadata() {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(METADATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.warn(`Tentativo ${attempt}/${RETRIES} fallito: ${e.message}`);
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}

/* --------------------------------- Main --------------------------------- */

(async () => {
  const now = zonedNow();
  const pad = (n) => String(n).padStart(2, '0');
  console.log(`Ora locale (${TIMEZONE}): ${now.date} ${pad(now.hour)}:${pad(now.minute)}:${pad(now.second)}`);

  let data;
  try {
    data = await fetchMetadata();
  } catch (e) {
    console.error('Impossibile leggere i metadati:', e.message);
    process.exit(1);
  }

  const connections = Number(data.connections);
  if (!Number.isFinite(connections)) {
    console.error('Campo "connections" assente o non valido nei metadati.');
    process.exit(1);
  }

  const db = loadDb();
  if (!db.days[now.date]) db.days[now.date] = { hours: {}, updatedAt: null };
  if (!db.days[now.date].hours || typeof db.days[now.date].hours !== 'object') {
    db.days[now.date].hours = {};
  }

  const key = String(now.hour);
  const already = Object.prototype.hasOwnProperty.call(db.days[now.date].hours, key);

  db.days[now.date].hours[key] = connections;
  db.days[now.date].updatedAt = localIso();
  db.last = {
    date: now.date,
    hour: now.hour,
    connections,
    recordedAt: localIso(),
    nowplaying: data.nowplaying || null,
    reason: already ? 'update' : 'scheduled',
  };

  saveDb(db);
  console.log(
    `Salvato: ${now.date} ${pad(now.hour)}:00 -> ${connections} ascoltatori (${
      already ? 'ora aggiornata' : 'nuova ora'
    })`
  );
  console.log(`Brano in onda: ${data.nowplaying || 'n/d'}`);
})();
