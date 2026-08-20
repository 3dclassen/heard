#!/usr/bin/env node
// ── HEARD — MOYN 2026 Timetable Import ──
//
// Angepasste Variante von import-timetable.js (das MODEM-Tool) für MOYN.
// Wichtigster Unterschied: MODEM-Artists hatten von Anfang an die korrekte Stage
// (hive/swamp/seed), MOYN-Artists stehen aktuell ALLE mit stage:"main" in der DB
// (Scraper-Import ohne Stage-Aufteilung). Deshalb:
//   - Matching läuft NUR über den Namen (nicht name+stage wie bei MODEM)
//   - "stage" wird beim Update MIT-geschrieben (bei MODEM bewusst nie angefasst)
//   - Namens-Normalisierung ist die robustere Variante aus dem WILDE-Import
//     (Diakritika, ß, Live/Hybrid-Suffixe) statt nur trim+lowercase — MOYN-Namen
//     haben deutlich mehr Sonderzeichen (Ø, Æ, ´, ...) als MODEM.
//
// Eingabe: EINE JSON-Datei (statt 3 feste Stage-Dateien wie bei MODEM, da wir die
// MOYN-Stage-Struktur vorher nicht kennen) — Format siehe MOYN_INPUT unten.
// Wird von Hand befüllt (Fotos vom Timetable -> Claude liest sie & trägt sie ein).
//
// Modi:
//   node import-moyn-timetable.js                  Dry-Run (nur lesen, Reports schreiben)
//   node import-moyn-timetable.js --write --yes     Schreibt die matched Updates in Firestore
//
// Beide Modi erstellen zuerst ein volles Backup der artists-Collection (wie bei MODEM).
// Unmatched Einträge werden NIE automatisch als neue Artists angelegt (anders als bei
// MODEM) — Namensabweichungen durch Handschrift/Fotoqualität sind bei einer frischen
// Übertragung wahrscheinlicher als bei MODEM's Copy-Paste-Timetable. Manuelle Prüfung
// im Report, danach entweder Namen in der Eingabedatei korrigieren oder explizit mit
// --create-unmatched neu anlegen.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const isWrite = process.argv.includes('--write');
const hasYes  = process.argv.includes('--yes');
const createUnmatched = process.argv.includes('--create-unmatched');

const FESTIVAL_ID = 'moyn-2026';
const INPUT_PATH = join(__dirname, 'moyn-timetable-input.json');
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');
const BACKUPS_DIR = join(__dirname, 'backups');
const REPORTS_DIR = join(__dirname, 'reports');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Robuste Normalisierung (identisch zum WILDE-Import) — Diakritika weg, ß->ss,
// æ/ø ausgeschrieben, "live"/"hybrid" ignoriert, nur noch a-z0-9 + Leerzeichen.
function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/\blive\b/g, '')
    .replace(/\bhybrid\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugStage(s) {
  return normalize(s).replace(/\s+/g, '-');
}

function hhmm(decimalHours) {
  if (decimalHours == null || Number.isNaN(decimalHours)) return '';
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Eingabedaten laden + validieren ──
//
// Erwartetes Format in moyn-timetable-input.json:
// [
//   { "name": "Acid Pauli", "stage": "Hilde", "day": "thursday", "time_start": 23, "time_end": 24.5 },
//   ...
// ]
// stage: Klartext wie auf dem Foto/Plan (wird automatisch zu einer kurzen ID normalisiert,
// z.B. "Hilde" -> "hilde"). day: monday..sunday (englisch, wie überall sonst in der App).
// time_start/time_end: Dezimalstunden, Mitternachts-Wrap wie im Rest der App üblich
// (z.B. start=23, end=1 für 23:00-01:00 — KEINE Werte über 24, siehe MODEM-Daten).

function loadInput() {
  if (!existsSync(INPUT_PATH)) {
    throw new Error(
      `Eingabedatei fehlt: ${INPUT_PATH}\n` +
      'Bitte moyn-timetable-input.json mit den Timetable-Einträgen anlegen (siehe Kommentar im Script-Kopf).'
    );
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`moyn-timetable-input.json ist kein valides JSON: ${err.message}`);
  }
  if (!Array.isArray(raw)) throw new Error('moyn-timetable-input.json muss ein Array sein.');

  return raw.map((entry, i) => {
    const where = `moyn-timetable-input.json[${i}]`;
    if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) {
      throw new Error(`${where}: "name" fehlt oder ist leer`);
    }
    if (typeof entry.stage !== 'string' || !entry.stage.trim()) {
      throw new Error(`${where}: "stage" fehlt oder ist leer`);
    }
    if (typeof entry.day !== 'string' || !entry.day.trim()) {
      throw new Error(`${where}: "day" fehlt oder ist leer`);
    }
    if (typeof entry.time_start !== 'number' || typeof entry.time_end !== 'number') {
      throw new Error(`${where}: "time_start"/"time_end" müssen Zahlen sein`);
    }
    return {
      raw_name: entry.name,
      match_key: normalize(entry.name),
      stage_label: entry.stage.trim(),
      stage: slugStage(entry.stage),
      day: entry.day.trim().toLowerCase(),
      time_start: entry.time_start,
      time_end: entry.time_end,
      notes: typeof entry.notes === 'string' && entry.notes.trim() ? entry.notes.trim() : null,
    };
  });
}

// ── Firebase Admin Init ──

function initFirestore() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(`service-account.json nicht gefunden unter ${SERVICE_ACCOUNT_PATH}`);
  }
  const admin = require('firebase-admin');
  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return { admin, db: admin.firestore() };
}

// ── Backup (komplette artists-Collection, alle Festivals — wie bei MODEM/WILDE) ──

async function backupArtistsCollection(db) {
  const snap = await db.collection('artists').get();
  const docs = snap.docs.map((d) => {
    const data = d.data();
    const plain = { ...data };
    if (plain.created_at?.toDate) plain.created_at = plain.created_at.toDate().toISOString();
    return { id: d.id, data: plain };
  });
  ensureDir(BACKUPS_DIR);
  const file = join(BACKUPS_DIR, `artists-backup-${timestamp()}.json`);
  writeFileSync(file, JSON.stringify({ exported_at: new Date().toISOString(), doc_count: docs.length, docs }, null, 2));
  console.log(`[backup] ${docs.length} Dokumente (alle Festivals) -> ${file}`);
  return { file, count: docs.length };
}

// ── Matching (nur über Namen — MOYN-Artists haben noch keine korrekte Stage) ──

async function buildDbMatchMap(db) {
  const snap = await db.collection('artists').where('festival_id', '==', FESTIVAL_ID).get();
  const map = new Map(); // normalizedName -> [{ id, data }]
  snap.docs.forEach((d) => {
    const data = d.data();
    const key = normalize(data.name ?? '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: d.id, data });
  });
  return map;
}

function classify(entries, dbMap) {
  const seenInInput = new Map();
  entries.forEach((e) => {
    if (!seenInInput.has(e.match_key)) seenInInput.set(e.match_key, []);
    seenInInput.get(e.match_key).push(e);
  });

  const result = { would_update: [], noop_identical: [], unmatched: [], skipped_ambiguous_db: [], duplicate_within_input: [] };
  const handledDupes = new Set();

  for (const e of entries) {
    const dupGroup = seenInInput.get(e.match_key);
    if (dupGroup.length > 1) {
      if (!handledDupes.has(e.match_key)) {
        handledDupes.add(e.match_key);
        result.duplicate_within_input.push({ match_key: e.match_key, occurrences: dupGroup });
      }
      continue;
    }

    const dbMatches = dbMap.get(e.match_key);
    if (!dbMatches || dbMatches.length === 0) {
      result.unmatched.push(e);
      continue;
    }
    if (dbMatches.length > 1) {
      result.skipped_ambiguous_db.push({ match_key: e.match_key, doc_ids: dbMatches.map((m) => m.id) });
      continue;
    }

    const dbDoc = dbMatches[0];
    const before = {
      stage: dbDoc.data.stage ?? null,
      day: dbDoc.data.day ?? null,
      time_start: dbDoc.data.time_start ?? null,
      time_end: dbDoc.data.time_end ?? null,
    };
    const after = { stage: e.stage, day: e.day, time_start: e.time_start, time_end: e.time_end };
    const changedFields = Object.keys(after).filter((f) => before[f] !== after[f]);

    const record = {
      doc_id: dbDoc.id, db_name: dbDoc.data.name, input_name: e.raw_name,
      stage_label: e.stage_label, before, after, changed_fields: changedFields,
    };
    if (changedFields.length === 0) result.noop_identical.push(record);
    else result.would_update.push(record);
  }

  return result;
}

// ── Near-Match-Vorschläge für Unmatched (Levenshtein) ──
//
// Bei Handschrift/Fotoqualität sind Transkriptionsfehler wahrscheinlicher als bei
// Copy-Paste-Timetables. Statt nur "kein Treffer" zu melden, schlagen wir den
// nächstliegenden DB-Namen vor (nur wenn wirklich nah dran) — spart beim manuellen
// Prüfen unter Zeitdruck das Durchsuchen der ganzen Liste von Hand.

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function suggestNearMatches(unmatched, dbMap) {
  const dbNames = [...dbMap.entries()].map(([key, matches]) => ({ key, name: matches[0]?.data?.name ?? key }));
  unmatched.forEach((e) => {
    const candidates = dbNames
      .map((db) => ({ name: db.name, distance: levenshtein(e.match_key, db.key) }))
      // Schwelle relativ zur Namenslänge — bei kurzen Namen sonst zu viele Zufallstreffer.
      .filter((c) => c.distance > 0 && c.distance <= Math.max(2, Math.floor(e.match_key.length * 0.25)))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
    e.suggestions = candidates.map((c) => c.name);
  });
}

// ── Reports ──

function printReport(classification, backupInfo, discoveredStages) {
  const line = '='.repeat(60);
  console.log(line);
  console.log(`MOYN Timetable Import — ${isWrite ? (hasYes ? 'WRITE' : 'WRITE (ohne --yes, nichts wird geschrieben)') : 'DRY RUN'}`);
  console.log(line);
  console.log(`[backup] ${backupInfo.count} Dokumente -> ${backupInfo.file}`);
  console.log(`[stages entdeckt] ${discoveredStages.map(([label, slug]) => `"${label}" -> ${slug}`).join(', ')}`);
  console.log('');

  console.log(`[WOULD UPDATE] ${classification.would_update.length}`);
  classification.would_update.slice(0, 30).forEach((r) => {
    console.log(`  - ${r.db_name} [${r.doc_id}]: ${r.changed_fields.join(', ')} | stage ${r.before.stage}->${r.after.stage} | ${r.before.day}->${r.after.day} | ${hhmm(r.before.time_start)}-${hhmm(r.before.time_end)} -> ${hhmm(r.after.time_start)}-${hhmm(r.after.time_end)}`);
  });
  if (classification.would_update.length > 30) console.log(`  ... und ${classification.would_update.length - 30} weitere (siehe JSON-Report)`);
  console.log('');

  console.log(`[BEREITS IDENTISCH] ${classification.noop_identical.length}`);
  console.log('');

  console.log(`[UNMATCHED — bitte manuell prüfen, ${createUnmatched ? 'werden mit --create-unmatched NEU angelegt' : 'werden NICHT angelegt'}] ${classification.unmatched.length}`);
  classification.unmatched.forEach((e) => {
    const hint = e.suggestions?.length ? ` | meinst du: ${e.suggestions.join(' / ')}?` : '';
    console.log(`  - "${e.raw_name}" (${e.stage_label}) | ${e.day} ${hhmm(e.time_start)}-${hhmm(e.time_end)}${hint}`);
  });
  console.log('');

  console.log(`[MEHRDEUTIGE DB-TREFFER — übersprungen] ${classification.skipped_ambiguous_db.length}`);
  classification.skipped_ambiguous_db.forEach((r) => console.log(`  - ${r.match_key}: doc_ids ${r.doc_ids.join(', ')}`));
  console.log('');

  console.log(`[DUPLIKATE INNERHALB DER EINGABEDATEI] ${classification.duplicate_within_input.length}`);
  classification.duplicate_within_input.forEach((r) => console.log(`  - ${r.match_key}: ${r.occurrences.length}x`));
  console.log('');

  console.log(line);
  console.log(`Summary: ${classification.would_update.length} update, ${classification.noop_identical.length} noop, ${classification.unmatched.length} unmatched, ${classification.skipped_ambiguous_db.length} ambiguous, ${classification.duplicate_within_input.length} duplicates`);
  console.log(line);
}

function writeJsonReport(classification, backupInfo) {
  ensureDir(REPORTS_DIR);
  const file = join(REPORTS_DIR, `moyn-timetable-report-${timestamp()}.json`);
  writeFileSync(file, JSON.stringify({ run_at: new Date().toISOString(), backup_file: backupInfo.file, ...classification }, null, 2));
  console.log(`[report] -> ${file}`);
}

// ── Write ──

async function writeUpdates(db, admin, classification, unmatchedToCreate) {
  if (isWrite && !hasYes) {
    console.log('');
    console.log('[abgebrochen] --write ohne --yes: es wurde NICHTS geschrieben.');
    console.log('Zum tatsächlichen Schreiben: node import-moyn-timetable.js --write --yes');
    return;
  }

  // In 400er-Chunks statt einem Riesen-Batch: bei wackliger Festival-Verbindung soll
  // ein Abbruch mittendrin nicht "alles oder nichts" bedeuten — bereits geschriebene
  // Chunks bleiben erhalten (im Write-Log nachvollziehbar), und der Import ist einfach
  // erneut ausführbar (idempotent, schreibt ja nur dieselben Zielwerte nochmal).
  const CHUNK_SIZE = 400;
  const writeLogFile = join(REPORTS_DIR, `moyn-timetable-write-log-${timestamp()}.json`);
  ensureDir(REPORTS_DIR);
  const written = [];
  const flushLog = () => writeFileSync(writeLogFile, JSON.stringify({
    run_at: new Date().toISOString(), written_count: written.length, written,
  }, null, 2));

  const updateOps = classification.would_update.map((r) => ({ type: 'update', record: r }));
  const createOps = unmatchedToCreate.map((e) => ({ type: 'create', record: e }));
  const operations = [...updateOps, ...createOps];

  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    chunk.forEach(({ type, record: r }) => {
      if (type === 'update') {
        batch.update(db.collection('artists').doc(r.doc_id), r.after);
      } else {
        const ref = db.collection('artists').doc();
        batch.set(ref, {
          name: r.raw_name, stage: r.stage, day: r.day,
          time_start: r.time_start, time_end: r.time_end,
          festival_id: FESTIVAL_ID, soundcloud_url: null,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
    try {
      await batch.commit();
      chunk.forEach(({ type, record: r }) => written.push({ type, id: r.doc_id ?? null, name: r.db_name ?? r.raw_name }));
      flushLog();
      console.log(`[write] Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} Operationen geschrieben.`);
    } catch (err) {
      flushLog();
      console.error(`[write] FEHLER in Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${err.message}`);
      console.error(`[write] ${written.length}/${operations.length} bereits geschrieben (siehe ${writeLogFile}).`);
      console.error('[write] Bei Verbindungsabbruch: einfach nochmal laufen lassen, ist idempotent (schreibt dieselben Zielwerte erneut).');
      throw err;
    }
  }

  console.log(`[write] Fertig: ${updateOps.length} Artists aktualisiert, ${createOps.length} neu angelegt. Log -> ${writeLogFile}`);

  // Festival-Dokument: entdeckte Stage-IDs additiv ergänzen (nie überschreiben).
  const festRef = db.collection('festivals').doc(FESTIVAL_ID);
  const festSnap = await festRef.get();
  const existingStages = new Set(festSnap.data()?.stages || []);
  const allStages = new Set([
    ...classification.would_update.map((r) => r.after.stage),
    ...classification.noop_identical.map((r) => r.after.stage),
    ...(unmatchedToCreate.map((e) => e.stage)),
  ]);
  const newStages = [...allStages].filter((s) => !existingStages.has(s));
  if (newStages.length > 0) {
    await festRef.set({ stages: [...existingStages, ...newStages] }, { merge: true });
    console.log(`[write] festivals/${FESTIVAL_ID}.stages ergänzt um: ${newStages.join(', ')}`);
    console.log(`[HINWEIS] Vergiss nicht FESTIVAL_STAGE_LABELS in js/app.js für '${FESTIVAL_ID}' zu ergänzen, sonst zeigen die Stage-Badges nur die rohe ID statt eines schönen Namens.`);
  }
}

// ── Main ──

async function main() {
  console.log(isWrite && !hasYes
    ? 'Modus: WRITE (ohne --yes -> zeigt nur Zusammenfassung, schreibt nichts)'
    : isWrite ? 'Modus: WRITE (--yes gesetzt -> schreibt tatsächlich in Firestore)'
    : 'Modus: DRY RUN (liest nur, schreibt nichts)');

  const entries = loadInput();
  const discoveredStages = [...new Map(entries.map((e) => [e.stage, e.stage_label])).entries()].map(([slug, label]) => [label, slug]);

  const { admin, db } = initFirestore();
  const backupInfo = await backupArtistsCollection(db);
  const dbMap = await buildDbMatchMap(db);
  const classification = classify(entries, dbMap);
  suggestNearMatches(classification.unmatched, dbMap);

  const unmatchedToCreate = createUnmatched ? classification.unmatched : [];

  printReport(classification, backupInfo, discoveredStages);
  writeJsonReport(classification, backupInfo);

  if (isWrite) {
    await writeUpdates(db, admin, classification, unmatchedToCreate);
  } else {
    console.log('');
    console.log('DRY RUN abgeschlossen — nichts geschrieben.');
    console.log('Report prüfen, dann: node import-moyn-timetable.js --write --yes');
    console.log('(bei echten neuen Artists zusätzlich --create-unmatched anhängen)');
  }
}

main().catch((err) => {
  console.error('[FEHLER]', err.message);
  process.exit(1);
});
