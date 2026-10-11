# Li.Fe. Radio — Ascolti & Metadati (versione GitHub)

Sito per tenere traccia degli ascoltatori della radio Li.Fe. e dei metadati
del brano in onda, **con registrazione automatica ogni ora e grafico
giornaliero**, ospitato gratis su **GitHub Pages** e aggiornato da
**GitHub Actions**.

Non serve alcun server, alcun cron esterno e non serve tenere aperto nessun
browser: ci pensa GitHub.

---

## Cosa fa

- **Brano in onda + dati stream**: legge in tempo reale i metadati della radio
  (brano, artista, copertina, bitrate, formato, ascoltatori live, ultimi
  passaggi).
- **Ascoltatori orari**: ogni ora GitHub Actions legge il numero di
  ascoltatori e lo salva in `data/listeners.json`.
- **Grafico giornaliero**: mostra gli ascoltatori ora per ora, con selettore
  del giorno, picco, media e numero di rilevazioni.

---

## Come funziona (in breve)

1. **GitHub Actions** esegue `scripts/record.js` ogni ora (file
   `.github/workflows/record.yml`).
2. Lo script legge i metadati della radio dalla porta 2020 — i server di
   GitHub hanno accesso a internet completo, quindi funziona.
3. Salva il campione in `data/listeners.json` e il workflow fa il **commit**
   nel repository.
4. **GitHub Pages** pubblica il sito, che legge quel file e disegna il
   grafico.

---

## Guida passo-passo (una volta sola, ~10 minuti)

### 1. Crea la repository
1. Vai su <https://github.com> e accedi (o crea un account gratuito).
2. Clicca **New repository**.
3. Nome, ad esempio: `life-radio-ascolti`.
4. Metti la spunta su **Public** (consigliato: le Actions sono illimitate e
   gratuite sui repo pubblici).
5. Clicca **Create repository**.

### 2. Carica i file
1. Nella pagina della repository, clicca **Add file → Upload files**.
2. Trascina **tutto il contenuto** di questa cartella (inclusa la cartella
   nascosta `.github` e le cartelle `scripts`, `data`, `immagini`).
   - In alternativa, se usi Git da terminale:
     ```bash
     git init
     git add .
     git commit -m "primo commit"
     git branch -M main
     git remote add origin https://github.com/TUO-UTENTE/life-radio-ascolti.git
     git push -u origin main
     ```
3. Clicca **Commit changes**.

> ⚠️ **Importante**: la cartella `.github/workflows/` deve essere caricata
> esattamente così. È quella che fa partire la registrazione automatica.

### 3. Attiva GitHub Pages
1. Vai in **Settings → Pages**.
2. In **Source** scegli **Deploy from a branch**.
3. **Branch**: `main`, cartella `/ (root)`. Clicca **Save**.
4. Dopo 1-2 minuti il sito sarà online su:
   `https://TUO-UTENTE.github.io/life-radio-ascolti/`

### 4. Attiva la registrazione automatica
1. Vai nella scheda **Actions** della repository.
2. Se compare un avviso, clicca **"I understand my workflows, go ahead and
   enable them"** (serve per abilitare i workflow sui repo nuovi).
3. Apri il workflow **"Registra ascoltatori"** → **Run workflow** per fare
   subito una prova.
4. Da ora in poi girerà **da solo ogni ora**.

Fatto! Il grafico si riempirà da solo, un'ora alla volta.

---

## Test rapidi (opzionali)

### Vedere subito il grafico con dati finti
Prima che GitHub accumuli dati reali, puoi generare 7 giorni di dati
dimostrativi. Da terminale, nella cartella del progetto:

```bash
node scripts/seed-demo.js
```

Poi carica il file modificato (`data/listeners.json`) su GitHub. La pagina
mostrerà il badge giallo **"Dati dimostrativi"** per non confonderli con
quelli reali.

### Azzerare tutti i dati
```bash
node scripts/reset-data.js
```

### Provare la registrazione in locale
```bash
node scripts/record.js
```

---

## Struttura dei file

```
life-radio-github/
├── index.html                      # la pagina (grafico + metadati)
├── app.js                          # logica lato browser
├── immagini/life.svg               # logo
├── data/listeners.json             # archivio ascoltatori (aggiornato da GitHub)
├── scripts/
│   ├── record.js                   # legge i metadati e salva l'ora corrente
│   ├── seed-demo.js                # genera dati dimostrativi (opzionale)
│   └── reset-data.js               # azzera i dati (opzionale)
├── .github/workflows/record.yml    # il "cron" di GitHub (ogni ora)
└── .nojekyll                       # evita che GitHub Pages ignori i file
```

---

## Formato dei dati

`data/listeners.json`:

```json
{
  "days": {
    "2026-10-11": {
      "hours": { "0": 4, "1": 3, "9": 38, "10": 42 },
      "updatedAt": "2026-10-11T10:05:12+02:00"
    }
  },
  "last": {
    "date": "2026-10-11",
    "hour": 10,
    "connections": 42,
    "recordedAt": "2026-10-11T10:05:12+02:00",
    "nowplaying": "GUNS AND ROSES - Sweet Child O' Mine",
    "reason": "scheduled"
  },
  "demo": false
}
```

---

## Domande frequenti

**Serve tenere aperto il browser?**
No. GitHub Actions registra ogni ora sui propri server, anche se nessuno
visita il sito.

**Quanto costa?**
Zero. Sui repository pubblici GitHub Actions e GitHub Pages sono gratuiti e
senza limiti pratici. (Sui repo privati hai 2000 minuti/mese di Actions: un
job orario da ~30 secondi ne consuma circa 720, quindi ci stai comodo.)

**E se un'ora viene saltata?**
I cron di GitHub a volte partono con qualche minuto di ritardo se i server
sono sovraccarichi. Lo script registra comunque l'ora corrente al momento
dell'esecuzione, quindi nella pratica ogni ora viene coperta. Se manca
qualche ora, la vedrai come spazio vuoto nel grafico (non è un errore).

**GitHub disattiva i workflow dopo un po'?**
GitHub disattiva i workflow programmati dopo **60 giorni di inattività** del
repository. Qui però il workflow stesso fa un commit ogni ora, quindi il
repository è sempre "attivo" e non viene mai disattivato.

**Posso cambiare l'ora di registrazione?**
Sì, modifica la riga `cron: '5 * * * *'` in
`.github/workflows/record.yml`. L'orario dei cron di GitHub è in **UTC**; lo
script converte da solo nell'ora italiana.

**Posso usare un dominio mio?**
Sì: in **Settings → Pages → Custom domain** puoi collegare un dominio
personalizzato.

---

## Note

- La lettura dei metadati live nel browser usa prima la connessione diretta
  (porta 2020) e, se la rete la blocca, ripiega su un proxy su porta 443
  (`r.jina.ai`). Su GitHub Actions invece la porta 2020 è sempre raggiungibile.
- Per cambiare l'indirizzo dei metadati: modifica `METADATA_URL` in
  `scripts/record.js` e in `app.js`.
