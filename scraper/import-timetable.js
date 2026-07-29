#!/usr/bin/env node
// ── HEARD — MODEM 2026 Timetable Import (Swamp / Seed / Hive) ──
//
// Aktualisiert bestehende artists-Dokumente in Firestore um day/time_start/
// time_end (und optional notes), gematcht über name+stage. Legt NIE neue
// Artists an und schreibt NIE das name-Feld.
//
// Modi:
//   node import-timetable.js                 Dry-Run (nur lesen, Reports schreiben)
//   node import-timetable.js --write --yes    Schreibt die matched Updates in Firestore
//
// Beide Modi erstellen zuerst ein volles Backup der artists-Collection.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const isWrite = process.argv.includes('--write');
const hasYes  = process.argv.includes('--yes');

const FESTIVAL_ID = 'modem-2026';
const VALID_STAGES = ['hive', 'swamp', 'seed'];

const TIMETABLE_FILES = [
  { key: 'swamp', path: join(__dirname, '..', 'TT', 'swamp-timetable.json') },
  { key: 'seed',  path: join(__dirname, '..', 'TT', 'seed-timetable.json') },
  { key: 'hive',  path: join(__dirname, '..', 'TT', 'hive-timetable.json') },
];

const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');
const BACKUPS_DIR = join(__dirname, 'backups');
const REPORTS_DIR = join(__dirname, 'reports');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function normalizeName(name) {
  return String(name).trim().toLowerCase();
}

function matchKey(name, stage) {
  return `${normalizeName(name)}|${stage}`;
}

// ── B2B/Vs/&-Splitting ──
//
// Kombi-Einträge im Timetable (z.B. "HYPOGEO & ELECTRYPNOSE") werden in zwei
// Einzel-Claims für die jeweiligen DJs aufgetrennt, jeweils mit einer notes-Angabe
// zum Partner. Gilt nur für Einträge, die nach der Basis-Klassifikation als
// unmatched_no_creation übrig bleiben — bereits als Einzeldokument existierende
// Kombi-Namen (z.B. "ALAGI & PAPA") durchlaufen das normale Update wie jeder
// andere Solo-Match und werden hier nicht angefasst.

const COMBO_SEPARATORS = [
  { type: 'b2b', regex: /\s+b2b\s+/i, phrase: 'b2b with' },
  { type: 'vs', regex: /\s+vs\.?\s+/i, phrase: 'vs' },
  { type: 'amp', regex: /\s*&\s*/, phrase: '&' },
];

const MIN_SPLIT_PART_LENGTH = 3;

// Dokumentierter Einzelfall (vom User bestätigt): "S&A IN DUB" (seed) ist ein
// zweiter Set-Slot des bereits bestehenden Duos "SYNTHBIONT & ANASSIMANDRUS"
// (seed) — kein generischer Namens-Split möglich ("S" + "A IN DUB" wäre Unsinn).
const NAME_ALIASES = [
  {
    match: (name, stage) => normalizeName(name) === 's&a in dub' && stage === 'seed',
    resolvedName: 'SYNTHBIONT & ANASSIMANDRUS',
    notes: 'in dub set',
  },
];

function splitCombo(name) {
  for (const sep of COMBO_SEPARATORS) {
    if (sep.regex.test(name)) {
      const parts = name.split(sep.regex).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 2 && parts.every((p) => p.length >= MIN_SPLIT_PART_LENGTH)) {
        return { parts, phrase: sep.phrase };
      }
    }
  }
  return null;
}

const looksComboLike = (name) => COMBO_SEPARATORS.some((sep) => sep.regex.test(name));

function hhmm(decimalHours) {
  if (decimalHours == null || Number.isNaN(decimalHours)) return '';
  // Zeiten können > 24 nicht vorkommen, aber Werte < time_start (Mitternachts-Wrap)
  // werden hier rein als Uhrzeit dargestellt, nicht als "nächster Tag" gerechnet.
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Eingabedaten laden + validieren ──

function loadTimetables() {
  const entries = [];
  for (const { key, path } of TIMETABLE_FILES) {
    if (!existsSync(path)) {
      throw new Error(`Timetable-Datei fehlt: ${path}`);
    }
    let raw;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      throw new Error(`Timetable-Datei ist kein valides JSON: ${path} (${err.message})`);
    }
    if (!Array.isArray(raw)) {
      throw new Error(`Timetable-Datei muss ein Array sein: ${path}`);
    }
    raw.forEach((entry, i) => {
      const where = `${key}-timetable.json[${i}]`;
      if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) {
        throw new Error(`${where}: "name" fehlt oder ist leer`);
      }
      if (!VALID_STAGES.includes(entry.stage)) {
        throw new Error(`${where}: "stage" ist ungültig (${entry.stage})`);
      }
      if (typeof entry.day !== 'string' || !entry.day.trim()) {
        throw new Error(`${where}: "day" fehlt oder ist leer`);
      }
      if (typeof entry.time_start !== 'number' || typeof entry.time_end !== 'number') {
        throw new Error(`${where}: "time_start"/"time_end" müssen Zahlen sein`);
      }
      entries.push({
        source_file: `${key}-timetable.json`,
        name: entry.name,
        stage: entry.stage,
        day: entry.day,
        time_start: entry.time_start,
        time_end: entry.time_end,
        notes: typeof entry.notes === 'string' && entry.notes.trim() ? entry.notes.trim() : null,
      });
    });
  }
  return entries;
}

// ── Firebase Admin Init ──

function initFirestore() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      `service-account.json nicht gefunden unter ${SERVICE_ACCOUNT_PATH}\n` +
      'Firebase Console → Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren.'
    );
  }
  const admin = require('firebase-admin');
  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return { admin, db: admin.firestore() };
}

// ── Backup ──

async function backupArtistsCollection(db) {
  const snap = await db.collection('artists').get();
  const docs = snap.docs.map((d) => {
    const data = d.data();
    const plain = { ...data };
    if (plain.created_at && typeof plain.created_at.toDate === 'function') {
      plain.created_at = plain.created_at.toDate().toISOString();
    }
    return { id: d.id, data: plain };
  });

  ensureDir(BACKUPS_DIR);
  const file = join(BACKUPS_DIR, `artists-backup-${timestamp()}.json`);
  writeFileSync(file, JSON.stringify({
    exported_at: new Date().toISOString(),
    collection: 'artists',
    doc_count: docs.length,
    docs,
  }, null, 2));

  console.log(`[backup] ${docs.length} Dokumente gesichert -> ${file}`);
  return { file, count: docs.length };
}

// ── Matching ──

async function buildDbMatchMap(db) {
  const snap = await db.collection('artists').where('festival_id', '==', FESTIVAL_ID).get();
  const map = new Map(); // matchKey -> [{ id, data }]
  snap.docs.forEach((d) => {
    const data = d.data();
    const key = matchKey(data.name ?? '', data.stage ?? '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: d.id, data });
  });
  return map;
}

function classifyEntries(timetableEntries, dbMap) {
  const seenWithinTimetable = new Map(); // key -> [entries]
  timetableEntries.forEach((e) => {
    const key = matchKey(e.name, e.stage);
    if (!seenWithinTimetable.has(key)) seenWithinTimetable.set(key, []);
    seenWithinTimetable.get(key).push(e);
  });

  const result = {
    would_update: [],
    noop_identical: [],
    unmatched_no_creation: [],
    skipped_ambiguous_db: [],
    duplicate_within_timetable: [],
  };

  const handledDuplicateKeys = new Set();

  for (const entry of timetableEntries) {
    const key = matchKey(entry.name, entry.stage);
    const dupGroup = seenWithinTimetable.get(key);

    if (dupGroup.length > 1) {
      if (!handledDuplicateKeys.has(key)) {
        handledDuplicateKeys.add(key);
        result.duplicate_within_timetable.push({
          match_key: key,
          occurrences: dupGroup,
        });
      }
      continue; // keiner der Duplikate wird verarbeitet
    }

    const dbMatches = dbMap.get(key);

    if (!dbMatches || dbMatches.length === 0) {
      result.unmatched_no_creation.push({
        source_file: entry.source_file,
        timetable_name: entry.name,
        stage: entry.stage,
        day: entry.day,
        time_start: entry.time_start,
        time_end: entry.time_end,
        notes: entry.notes,
      });
      continue;
    }

    if (dbMatches.length > 1) {
      result.skipped_ambiguous_db.push({
        match_key: key,
        doc_ids: dbMatches.map((m) => m.id),
        docs: dbMatches,
      });
      continue;
    }

    const dbDoc = dbMatches[0];
    const before = {
      day: dbDoc.data.day ?? null,
      time_start: dbDoc.data.time_start ?? null,
      time_end: dbDoc.data.time_end ?? null,
      notes: dbDoc.data.notes ?? null,
    };
    const after = {
      day: entry.day,
      time_start: entry.time_start,
      time_end: entry.time_end,
      // notes: nur anfassen, wenn im Timetable-Eintrag vorhanden
      notes: entry.notes !== null ? entry.notes : before.notes,
    };

    const changedFields = [];
    if (before.day !== after.day) changedFields.push('day');
    if (before.time_start !== after.time_start) changedFields.push('time_start');
    if (before.time_end !== after.time_end) changedFields.push('time_end');
    if (entry.notes !== null && before.notes !== after.notes) changedFields.push('notes');

    const record = {
      doc_id: dbDoc.id,
      source_file: entry.source_file,
      timetable_name: entry.name,
      db_name: dbDoc.data.name,
      stage: entry.stage,
      before,
      after,
      changed_fields: changedFields,
      // notes wird nur geschrieben, wenn im Timetable-Eintrag vorhanden
      write_notes: entry.notes !== null,
    };

    if (changedFields.length === 0) {
      result.noop_identical.push(record);
    } else {
      result.would_update.push(record);
    }
  }

  return result;
}

// ── Kombi-Splitting + Neuanlage für unmatched_no_creation ──
//
// Läuft NACH der Basis-Klassifikation. Jeder unmatched-Eintrag wird zu einem oder
// zwei "Claims" (Anspruch auf einen Zeitslot für name+stage). Claims werden pro
// Schlüssel gruppiert: der erste Claim eines Schlüssels bekommt das bestehende,
// noch unbeanspruchte Dokument (Update) oder — falls keins existiert — ein neues
// Dokument (Neuanlage, create_reason "new_artist"). Jeder WEITERE Claim auf
// denselben Schlüssel (weil der Name schon anderweitig auf dieser Stage einen
// Solo-Termin hat, oder weil zwei Kombis denselben Namen nennen) bekommt immer
// ein zusätzliches neues Dokument (create_reason "combo_secondary_slot") — der
// bereits bestehende/erste Termin wird dabei NIE angefasst.
function resolveUnmatched(classification, dbMap) {
  const claims = [];
  const ambiguousCombo = [];

  for (const entry of classification.unmatched_no_creation) {
    const alias = NAME_ALIASES.find((a) => a.match(entry.timetable_name, entry.stage));
    if (alias) {
      claims.push({
        key: matchKey(alias.resolvedName, entry.stage),
        name: alias.resolvedName,
        stage: entry.stage,
        day: entry.day,
        time_start: entry.time_start,
        time_end: entry.time_end,
        notes: alias.notes,
        source_file: entry.source_file,
        source_label: entry.timetable_name,
      });
      continue;
    }

    const combo = splitCombo(entry.timetable_name);
    if (combo) {
      const [a, b] = combo.parts;
      claims.push({
        key: matchKey(a, entry.stage), name: a, stage: entry.stage,
        day: entry.day, time_start: entry.time_start, time_end: entry.time_end,
        notes: `${combo.phrase} ${b}`, source_file: entry.source_file, source_label: entry.timetable_name,
      });
      claims.push({
        key: matchKey(b, entry.stage), name: b, stage: entry.stage,
        day: entry.day, time_start: entry.time_start, time_end: entry.time_end,
        notes: `${combo.phrase} ${a}`, source_file: entry.source_file, source_label: entry.timetable_name,
      });
      continue;
    }

    if (looksComboLike(entry.timetable_name)) {
      ambiguousCombo.push({
        ...entry,
        reason: 'Name enthält b2b/&/vs-Muster, konnte aber nicht sicher in zwei Teile getrennt werden',
      });
      continue;
    }

    // Normaler Neuzugang ohne Kombi-Muster
    claims.push({
      key: matchKey(entry.timetable_name, entry.stage), name: entry.timetable_name, stage: entry.stage,
      day: entry.day, time_start: entry.time_start, time_end: entry.time_end, notes: entry.notes ?? null,
      source_file: entry.source_file, source_label: entry.timetable_name,
    });
  }

  const claimsByKey = new Map();
  for (const c of claims) {
    if (!claimsByKey.has(c.key)) claimsByKey.set(c.key, []);
    claimsByKey.get(c.key).push(c);
  }

  const primaryClaimedKeys = new Set([
    ...classification.would_update.map((r) => matchKey(r.db_name, r.stage)),
    ...classification.noop_identical.map((r) => matchKey(r.db_name, r.stage)),
  ]);

  const wouldCreate = [];

  for (const [key, keyClaims] of claimsByKey) {
    const alreadyPrimary = primaryClaimedKeys.has(key);
    const dbMatches = dbMap.get(key);

    if (dbMatches && dbMatches.length > 1) {
      keyClaims.forEach((c) => ambiguousCombo.push({
        source_file: c.source_file, timetable_name: c.source_label, stage: c.stage,
        day: c.day, time_start: c.time_start, time_end: c.time_end, notes: c.notes,
        reason: `mehrdeutiger DB-Treffer für "${c.name}" (${c.stage})`,
      }));
      continue;
    }

    const hasFreeDoc = !alreadyPrimary && dbMatches && dbMatches.length === 1;

    keyClaims.forEach((claim, idx) => {
      const isPrimarySlot = !alreadyPrimary && idx === 0;

      if (isPrimarySlot && hasFreeDoc) {
        const dbDoc = dbMatches[0];
        const before = {
          day: dbDoc.data.day ?? null,
          time_start: dbDoc.data.time_start ?? null,
          time_end: dbDoc.data.time_end ?? null,
          notes: dbDoc.data.notes ?? null,
        };
        const after = { day: claim.day, time_start: claim.time_start, time_end: claim.time_end, notes: claim.notes };
        const changedFields = ['day', 'time_start', 'time_end', 'notes'].filter((f) => before[f] !== after[f]);
        const record = {
          doc_id: dbDoc.id, source_file: claim.source_file, timetable_name: claim.source_label,
          db_name: dbDoc.data.name, stage: claim.stage, before, after,
          changed_fields: changedFields, write_notes: true, combo_derived: true,
        };
        if (changedFields.length === 0) classification.noop_identical.push(record);
        else classification.would_update.push(record);
      } else if (isPrimarySlot && !hasFreeDoc) {
        wouldCreate.push({
          source_file: claim.source_file, timetable_name: claim.source_label, name: claim.name, stage: claim.stage,
          day: claim.day, time_start: claim.time_start, time_end: claim.time_end, notes: claim.notes,
          soundcloud_url: null, create_reason: 'new_artist',
        });
      } else {
        const siblingDoc = dbMatches && dbMatches[0];
        wouldCreate.push({
          source_file: claim.source_file, timetable_name: claim.source_label, name: claim.name, stage: claim.stage,
          day: claim.day, time_start: claim.time_start, time_end: claim.time_end, notes: claim.notes,
          soundcloud_url: siblingDoc?.data?.soundcloud_url ?? null, create_reason: 'combo_secondary_slot',
        });
      }
    });
  }

  classification.unmatched_no_creation = [];
  classification.would_create = wouldCreate;
  classification.ambiguous_combo_needs_manual_review = ambiguousCombo;
}

// ── Reports ──

function printConsoleReport(classification, backupInfo, sourceCounts) {
  const line = '='.repeat(60);
  console.log(line);
  console.log(`HEARD Timetable Import — ${isWrite ? 'WRITE' : 'DRY RUN'}`);
  console.log(line);
  console.log(`[backup] ${backupInfo.count} Dokumente -> ${backupInfo.file}`);
  console.log('');
  console.log('[source files]');
  for (const [k, v] of Object.entries(sourceCounts)) {
    console.log(`  ${k}: ${v} Einträge`);
  }
  console.log('');

  console.log(`[WOULD UPDATE] ${classification.would_update.length} Einträge`);
  classification.would_update.slice(0, 20).forEach((r) => {
    console.log(
      `  - ${r.timetable_name} (${r.stage}) [${r.doc_id}] geändert: ${r.changed_fields.join(', ')} ` +
      `| day ${r.before.day} -> ${r.after.day} | ${hhmm(r.before.time_start)}-${hhmm(r.before.time_end)} -> ${hhmm(r.after.time_start)}-${hhmm(r.after.time_end)}`
    );
  });
  if (classification.would_update.length > 20) {
    console.log(`  ... und ${classification.would_update.length - 20} weitere (siehe CSV/JSON Report)`);
  }
  console.log('');

  console.log(`[NO-OP / BEREITS IDENTISCH] ${classification.noop_identical.length} Einträge`);
  console.log('');

  const newArtists = classification.would_create.filter((r) => r.create_reason === 'new_artist');
  const secondarySlots = classification.would_create.filter((r) => r.create_reason === 'combo_secondary_slot');

  console.log(`[WOULD CREATE — NEUE ARTISTS] ${newArtists.length} Einträge`);
  newArtists.forEach((r) => {
    console.log(`  - ${r.name} (${r.stage}) | ${r.day} ${hhmm(r.time_start)}-${hhmm(r.time_end)}${r.notes ? ' | notes: ' + r.notes : ''}`);
  });
  console.log('');

  console.log(`[WOULD CREATE — ZUSÄTZLICHER SLOT (B2B/Vs/&, bestehender Termin bleibt unverändert)] ${secondarySlots.length} Einträge`);
  secondarySlots.forEach((r) => {
    console.log(`  - ${r.name} (${r.stage}) | ${r.day} ${hhmm(r.time_start)}-${hhmm(r.time_end)} | notes: ${r.notes} | Quelle: "${r.timetable_name}"`);
  });
  console.log('');

  console.log(`[UNMATCHED — NICHT ANGELEGT] ${classification.unmatched_no_creation.length} Einträge`);
  classification.unmatched_no_creation.forEach((r) => {
    console.log(`  - ${r.timetable_name} (${r.stage}) [${r.source_file}]`);
  });
  console.log('');

  console.log(`[KOMBI-MUSTER, MANUELL PRÜFEN] ${classification.ambiguous_combo_needs_manual_review.length} Einträge`);
  classification.ambiguous_combo_needs_manual_review.forEach((r) => {
    console.log(`  - ${r.timetable_name} (${r.stage}) [${r.source_file}]: ${r.reason}`);
  });
  console.log('');

  console.log(`[AMBIGUOUS DB MATCHES — ÜBERSPRUNGEN] ${classification.skipped_ambiguous_db.length}`);
  classification.skipped_ambiguous_db.forEach((r) => {
    console.log(`  - ${r.match_key}: doc_ids ${r.doc_ids.join(', ')}`);
  });
  console.log('');

  console.log(`[DUPLIKATE INNERHALB TIMETABLE-DATEI] ${classification.duplicate_within_timetable.length}`);
  classification.duplicate_within_timetable.forEach((r) => {
    console.log(`  - ${r.match_key}: ${r.occurrences.length}x in ${r.occurrences[0].source_file}`);
  });
  console.log('');

  console.log(line);
  console.log(
    `Summary: ${classification.would_update.length} would_update, ` +
    `${classification.noop_identical.length} noop, ` +
    `${newArtists.length} create(new_artist), ` +
    `${secondarySlots.length} create(combo_secondary_slot), ` +
    `${classification.unmatched_no_creation.length} unmatched, ` +
    `${classification.ambiguous_combo_needs_manual_review.length} combo-unclear, ` +
    `${classification.skipped_ambiguous_db.length} ambiguous, ` +
    `${classification.duplicate_within_timetable.length} duplicates`
  );
  console.log(line);
}

function writeJsonReport(classification, backupInfo, sourceCounts, mode) {
  ensureDir(REPORTS_DIR);
  const file = join(REPORTS_DIR, `timetable-import-report-${timestamp()}.json`);
  writeFileSync(file, JSON.stringify({
    run_at: new Date().toISOString(),
    mode,
    backup_file: backupInfo.file,
    source_files: sourceCounts,
    summary: {
      would_update: classification.would_update.length,
      noop_identical: classification.noop_identical.length,
      would_create_new_artist: classification.would_create.filter((r) => r.create_reason === 'new_artist').length,
      would_create_combo_secondary_slot: classification.would_create.filter((r) => r.create_reason === 'combo_secondary_slot').length,
      unmatched_no_creation: classification.unmatched_no_creation.length,
      ambiguous_combo_needs_manual_review: classification.ambiguous_combo_needs_manual_review.length,
      skipped_ambiguous_db: classification.skipped_ambiguous_db.length,
      duplicate_within_timetable: classification.duplicate_within_timetable.length,
    },
    ...classification,
  }, null, 2));
  console.log(`[report] JSON -> ${file}`);
  return file;
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsvReport(classification) {
  ensureDir(REPORTS_DIR);
  const file = join(REPORTS_DIR, `timetable-import-report-${timestamp()}.csv`);

  const headers = [
    'source_file', 'timetable_name', 'db_name', 'stage', 'doc_id', 'match_status', 'action', 'create_reason',
    'old_day', 'new_day',
    'old_time_start', 'new_time_start', 'old_time_start_hhmm', 'new_time_start_hhmm',
    'old_time_end', 'new_time_end', 'old_time_end_hhmm', 'new_time_end_hhmm',
    'old_notes', 'new_notes', 'changed_fields',
  ];

  const rows = [];

  const addRow = (r, status, action = 'update', createReason = '') => {
    rows.push([
      r.source_file, r.timetable_name, r.db_name ?? '', r.stage, r.doc_id ?? '', status, action, createReason,
      r.before?.day ?? '', r.after?.day ?? '',
      r.before?.time_start ?? '', r.after?.time_start ?? '',
      hhmm(r.before?.time_start), hhmm(r.after?.time_start),
      r.before?.time_end ?? '', r.after?.time_end ?? '',
      hhmm(r.before?.time_end), hhmm(r.after?.time_end),
      r.before?.notes ?? '', r.after?.notes ?? '',
      (r.changed_fields || []).join('|'),
    ]);
  };

  classification.would_update.forEach((r) => addRow(r, 'would_update', 'update'));
  classification.noop_identical.forEach((r) => addRow(r, 'noop_identical', 'update'));
  classification.would_create.forEach((r) => rows.push([
    r.source_file, r.timetable_name, r.name, r.stage, '', 'would_create', 'create', r.create_reason,
    '', r.day, '', r.time_start, '', hhmm(r.time_start),
    '', r.time_end, '', hhmm(r.time_end), '', r.notes ?? '', '',
  ]));
  classification.unmatched_no_creation.forEach((r) => rows.push([
    r.source_file, r.timetable_name, '', r.stage, '', 'unmatched_no_creation', '', '',
    '', r.day, '', r.time_start, '', hhmm(r.time_start),
    '', r.time_end, '', hhmm(r.time_end), '', r.notes ?? '', '',
  ]));
  classification.ambiguous_combo_needs_manual_review.forEach((r) => rows.push([
    r.source_file, r.timetable_name, '', r.stage, '', 'ambiguous_combo_needs_manual_review', '', '',
    '', r.day, '', r.time_start, '', hhmm(r.time_start),
    '', r.time_end, '', hhmm(r.time_end), '', r.notes ?? '', r.reason,
  ]));
  classification.skipped_ambiguous_db.forEach((r) => rows.push([
    '', r.match_key, '', '', r.doc_ids.join('|'), 'skipped_ambiguous_db', '', '',
    '', '', '', '', '', '', '', '', '', '', '', '', '',
  ]));
  classification.duplicate_within_timetable.forEach((r) => rows.push([
    r.occurrences[0].source_file, r.match_key, '', '', '', 'duplicate_within_timetable', '', '',
    '', '', '', '', '', '', '', '', '', '', '', '', `${r.occurrences.length}x`,
  ]));

  const csv = [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
  writeFileSync(file, csv, 'utf8');
  console.log(`[report] CSV (Excel) -> ${file}`);
  return file;
}

// ── Write ──

async function writeUpdates(db, admin, classification) {
  const toUpdate = classification.would_update;
  const toCreate = classification.would_create;
  console.log('');
  console.log(
    `Aktualisiere ${toUpdate.length} bestehende Dokumente. ` +
    `Lege ${toCreate.length} neue Dokumente an ` +
    `(${toCreate.filter((r) => r.create_reason === 'new_artist').length} neue Artists, ` +
    `${toCreate.filter((r) => r.create_reason === 'combo_secondary_slot').length} zusätzliche B2B/Vs/&-Slots). ` +
    `${classification.noop_identical.length} bereits identisch übersprungen. ` +
    `${classification.unmatched_no_creation.length} ohne Match bleiben unverändert. ` +
    `${classification.ambiguous_combo_needs_manual_review.length} Kombi-Muster bleiben zur manuellen Prüfung unangetastet.`
  );

  if (!hasYes) {
    console.log('');
    console.log('[abgebrochen] --write ohne --yes: es wurde NICHTS geschrieben.');
    console.log('Zum tatsächlichen Schreiben: node import-timetable.js --write --yes');
    return { written: [], aborted: true };
  }

  const written = [];
  const writeLogFile = join(REPORTS_DIR, `timetable-write-log-${timestamp()}.json`);
  ensureDir(REPORTS_DIR);

  const flushLog = () => {
    writeFileSync(writeLogFile, JSON.stringify({
      run_at: new Date().toISOString(),
      total_planned: toUpdate.length + toCreate.length,
      written_count: written.length,
      written,
    }, null, 2));
  };

  // Updates (bestehende Dokumente, partielles Feld-Update) und Creates (neue
  // Dokumente, komplett neue Auto-ID) laufen in denselben 400er-Batches.
  const operations = [
    ...toUpdate.map((r) => ({ type: 'update', record: r })),
    ...toCreate.map((r) => ({ type: 'create', record: r })),
  ];

  const CHUNK_SIZE = 400;
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    chunk.forEach(({ type, record: r }) => {
      if (type === 'update') {
        const payload = {
          day: r.after.day,
          time_start: r.after.time_start,
          time_end: r.after.time_end,
        };
        if (r.write_notes) payload.notes = r.after.notes;
        batch.update(db.collection('artists').doc(r.doc_id), payload);
      } else {
        const ref = db.collection('artists').doc();
        r._new_doc_id = ref.id;
        const payload = {
          name: r.name,
          stage: r.stage,
          day: r.day,
          time_start: r.time_start,
          time_end: r.time_end,
          festival_id: FESTIVAL_ID,
          soundcloud_url: r.soundcloud_url ?? null,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (r.notes) payload.notes = r.notes;
        batch.set(ref, payload);
      }
    });

    try {
      await batch.commit();
      chunk.forEach(({ type, record: r }) => written.push({
        type, ...r, write_completed_at: new Date().toISOString(),
      }));
      flushLog();
      console.log(`[write] Batch ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} Operationen geschrieben.`);
    } catch (err) {
      flushLog();
      console.error(`[write] FEHLER in Batch ${Math.floor(i / CHUNK_SIZE) + 1}:`, err.message);
      console.error(`[write] ${written.length} von ${operations.length} Operationen wurden erfolgreich geschrieben, bevor der Fehler auftrat.`);
      console.error(`[write] Write-Log: ${writeLogFile}`);
      throw err;
    }
  }

  flushLog();
  console.log(`[write] Fertig. ${written.length} Operationen ausgeführt. Log -> ${writeLogFile}`);
  return { written, aborted: false };
}

// ── Main ──

async function main() {
  console.log(isWrite && !hasYes
    ? 'Modus: WRITE (ohne --yes -> zeigt nur Zusammenfassung, schreibt nichts)'
    : isWrite
      ? 'Modus: WRITE (--yes gesetzt -> schreibt tatsächlich in Firestore)'
      : 'Modus: DRY RUN (liest nur, schreibt nichts)');

  const timetableEntries = loadTimetables();
  const sourceCounts = {};
  for (const { key } of TIMETABLE_FILES) {
    sourceCounts[key] = timetableEntries.filter((e) => e.source_file === `${key}-timetable.json`).length;
  }

  const { admin, db } = initFirestore();

  const backupInfo = await backupArtistsCollection(db);

  const dbMap = await buildDbMatchMap(db);
  const classification = classifyEntries(timetableEntries, dbMap);
  resolveUnmatched(classification, dbMap);

  printConsoleReport(classification, backupInfo, sourceCounts);
  writeJsonReport(classification, backupInfo, sourceCounts, isWrite ? 'write' : 'dry-run');
  writeCsvReport(classification);

  if (isWrite) {
    await writeUpdates(db, admin, classification);
  } else {
    console.log('');
    console.log('DRY RUN abgeschlossen — es wurde nichts in Firestore geschrieben.');
    console.log('Bitte CSV-Report in Excel prüfen. Erst nach Freigabe: node import-timetable.js --write --yes');
  }
}

main().catch((err) => {
  console.error('[FEHLER]', err.message);
  process.exit(1);
});
