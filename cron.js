const fs = require('fs');

const PROXIES = [
  "https://corsproxy.io/?url=",
  "https://api.codetabs.com/v1/proxy?quest=",
  "https://api.allorigins.win/raw?url="
];

const STATIONS = [
  { key:'ivreaandata',    name:'Ivrea (Arrivi)',        url:'https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?placeId=1508&arrivals=true' },
  { key:'ivrearitorno',   name:'Ivrea (Partenze)',      url:'https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?placeId=1508&arrivals=false' },
  { key:'chivassoandata',  name:'Chivasso (Arrivi)',     url:'https://iechub.rfi.it/ArriviPartenze/arrivalsdepartures/Monitor?placeId=1105&arrivals=true' },
  { key:'chivassoritorno', name:'Chivasso (Partenze)',   url:'https://iechub.rfi.it/ArriviPartenze/arrivalsdepartures/Monitor?placeId=1105&arrivals=false' },
  { key:'torinoandata',    name:'Torino P. Nuova (Arr)', url:'https://iechub.rfi.it/ArriviPartenze/arrivalsdepartures/Monitor?placeId=2876&arrivals=true' },
  { key:'torinoritorno',   name:'Torino P. Nuova (Part)', url:'https://iechub.rfi.it/ArriviPartenze/arrivalsdepartures/Monitor?placeId=2876&arrivals=false' },
];

const VERDICTS = [
  { max:6,  cls:'ok',     word:'VAI TRANQUILLO', subs:['Treni in linea con le aspettative.']},
  { max:14, cls:'warn',   word:'VAI CON RISERVA', subs:['Qualche accumulo di ritardo qua e là.']},
  { max:26, cls:'danger', word:'PENSACI DUE VOLTE', subs:['Iniziano i ritardi pesanti sulle tratte principali.']},
  { max:Infinity, cls:'apoc', word:'NON ANDARE', subs:['Il caos ha preso il sopravvento sulla linea.']},
];

function isTargetTrain(train) {
  const luogo = (train.luogo || '').toUpperCase();
  return luogo.includes('IVREA') || luogo.includes('TORINO') || luogo.includes('TO.') || luogo.includes('NOVARA') || luogo.includes('MILANO') || luogo.includes('MI.');
}

function cleanHtmlText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function parseBoardRegex(html) {
  const trains = [];
  const trMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  if (trMatches.length === 0) return [];

  let headers = [];
  const firstRowText = trMatches[0].toLowerCase();
  if (firstRowText.includes('<th') || firstRowText.includes('treno')) {
    const thMatches = trMatches[0].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
    headers = thMatches.map(th => th.replace(/<[^>]*>/g, '').trim().toLowerCase());
  }

  const idx = (needle) => headers.findIndex(h => h.includes(needle));
  const iTreno = idx('treno'), iCategoria = idx('categoria'), iRitardo = idx('ritardo'), iOrario = idx('orario');
  let iLuogo = idx('proven');
  if (iLuogo < 0) iLuogo = idx('destinaz');

  const dataRows = headers.length > 0 ? trMatches.slice(1) : trMatches;

  for (const row of dataRows) {
    const tdMatches = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
    if (tdMatches.length === 0) continue;

    const text = (i) => {
      if (i >= 0 && tdMatches[i]) {
        return cleanHtmlText(tdMatches[i].replace(/<[^>]*>/g, ''));
      }
      return '';
    };

    const fullRowText = row.replace(/<[^>]*>/g, '').toUpperCase();
    const categoria = text(iCategoria);
    const ritardoRaw = text(iRitardo);
    const ritardo = parseInt(ritardoRaw.replace(/[^\d-]/g, ''), 10);

    const trainObj = {
      treno: text(iTreno) || '—',
      categoria,
      luogo: text(iLuogo),
      orario: text(iOrario),
      ritardo: isNaN(ritardo) ? 0 : ritardo,
      isBus: categoria.toUpperCase().includes('BUS'),
      soppresso: fullRowText.includes('SOPPRESS') || fullRowText.includes('CANCELL'),
    };

    if (isTargetTrain(trainObj)) {
      trains.push(trainObj);
    }
  }
  return trains;
}

async function fetchWithFallback(station) {
  let lastError = null;
  for (let i = 0; i < PROXIES.length; i++) {
    try {
      const response = await fetch(PROXIES[i] + encodeURIComponent(station.url), { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      return parseBoardRegex(html);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Tutti i proxy hanno fallito");
}

async function run() {
  console.log("Inizio scansione cloud...");
  const databaseFile = 'stato_treni.json';
  let database = { timeline: [], stazioni: {} };

  if (fs.existsSync(databaseFile)) {
    try {
      database = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
    } catch (e) {
      console.error("Errore lettura database vecchio, ne creo uno nuovo.");
    }
  }

  const now = new Date();
  const oraCorrente = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  const dataCorrente = now.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });

  if (!database.dataLog || database.dataLog !== dataCorrente) {
    database.timeline = [];
    database.dataLog = dataCorrente;
  }

  let totalScoreSum = 0;
  let okStationsCount = 0;

  for (const station of STATIONS) {
    try {
      const trains = await fetchWithFallback(station);
      
      const real = trains.filter(t => !t.isBus);
      const soppressiTrains = real.filter(t => t.soppresso);
      const delayed = real.filter(t => t.ritardo > 0 && !t.soppresso);
      const avgDelay = delayed.length ? delayed.reduce((s, t) => s + t.ritardo, 0) / delayed.length : 0;
      const maxDelay = real.reduce((m, t) => Math.max(m, t.ritardo), 0);

      const stats = {
        total: real.length,
        delayedCount: delayed.length,
        avgDelay,
        maxDelay,
        soppressi: soppressiTrains.length,
        soppressiTrains: soppressiTrains.map(t => ({ treno: t.treno, orario: t.orario, luogo: t.luogo })),
        delayedTrains: delayed.map(t => ({ treno: t.treno, orario: t.orario, luogo: t.luogo, ritardo: t.ritardo }))
      };

      const score = stats.total === 0 ? 0 : stats.avgDelay * 0.6 + stats.maxDelay * 0.2 + (stats.delayedCount / stats.total) * 20 + stats.soppressi * 15;
      
      database.stazioni[station.key] = { stats, error: null };
      totalScoreSum += score;
      okStationsCount++;
    } catch (e) {
      console.error(`Errore stazione ${station.name}:`, e.message);
      database.stazioni[station.key] = { stats: null, error: e.message };
    }
  }

  if (okStationsCount > 0) {
    const totalScore = totalScoreSum / okStationsCount;
    const verdict = VERDICTS.find(v => totalScore <= v.max) || VERDICTS[VERDICTS.length - 1];

    database.lastUpdate = now.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
    database.totalScore = totalScore;
    database.verdettoAttuale = { cls: verdict.cls, word: verdict.word, sub: verdict.subs[0] };

    if (database.timeline.length === 0 || database.timeline[database.timeline.length - 1].ora !== oraCorrente) {
      database.timeline.push({ ora: oraCorrente, score: totalScore, classe: verdict.cls });
    }

    fs.writeFileSync(databaseFile, JSON.stringify(database, null, 2));
    console.log("Scansione completata e stato_treni.json aggiornato.");
  } else {
    console.error("Tutte le stazioni sono andate in errore. File JSON non aggiornato.");
  }
}

run();
