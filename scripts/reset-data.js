#!/usr/bin/env node
'use strict';

/**
 * Azzera i dati degli ascoltatori (data/listeners.json).
 * Uso:  node scripts/reset-data.js
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'listeners.json');
const empty = { days: {}, last: null, demo: false };

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.writeFileSync(DATA_FILE, JSON.stringify(empty, null, 2) + '\n', 'utf8');
console.log('Dati azzerati:', DATA_FILE);
