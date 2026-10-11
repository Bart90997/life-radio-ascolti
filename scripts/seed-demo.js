#!/usr/bin/env node
'use strict';

/**
 * Genera dei dati DIMOSTRATIVI in data/listeners.json.
 * Utile solo per vedere subito come funzionano i grafici (prima che
 * GitHub Actions accumuli i dati reali).
 *
 * Uso:  node scripts/seed-demo.js
 * Per azzerare:  node scripts/reset-data.js
 *
 * Nota: imposta "demo": true, così la pagina mostra il badge
 * "Dati dimostrativi" e non li confondi con quelli reali.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'listeners.json');

function romeDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(d);
}

// Curva realistica degli ascolti durante la giornata (0-23)
const CURVE = [
  6, 4, 3, 3, 4, 7, 14, 26, 34, 38, 41, 43,
  45, 44, 42, 40, 39, 42, 46, 48, 44, 36, 24, 12,
];

function jitter(base, seed) {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = n - Math.floor(n);
  return Math.round((frac - 0.5) * 8);
}

const days = {};
const nowHour = Number(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', hour: '2-digit', hour12: false,
  }).format(new Date())
);

for (let offset = 6; offset >= 0; offset--) {
  const date = romeDate(-offset);
  const hours = {};
  const lastHour = offset === 0 ? Math.min(nowHour, 23) : 23;
  for (let h = 0; h <= lastHour; h++) {
    const base = CURVE[h];
    hours[h] = Math.max(0, base + jitter(base, offset * 100 + h));
  }
  days[date] = { hours, updatedAt: new Date().toISOString() };
}

const db = { days, last: null, demo: true };
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2) + '\n', 'utf8');
console.log(`Dati demo creati per ${Object.keys(days).length} giorni in ${DATA_FILE}`);
console.log('Sono dati finti: usa "node scripts/reset-data.js" per azzerarli.');
