#!/usr/bin/env node
// ── HEARD — Einmalige Migration: Crew wird festival-spezifisch ──
//
// crew_connections/crew_invites hatten bisher kein festival_id-Feld — Crew war app-weit,
// nicht pro Festival. Setzt festival_id: 'modem-2026' auf allen bestehenden Dokumenten
// beider Collections, denen das Feld fehlt (MODEM war bislang das einzige Festival mit
// echter Nutzung, daher korrekt als rückwirkender Kontext). Rührt sonst nichts an.
//
// Modi:
//   node migrate-crew-festival.js                Dry-Run (nur lesen, nichts schreiben)
//   node migrate-crew-festival.js --write --yes   Schreibt tatsächlich

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const isWrite = process.argv.includes('--write');
const hasYes  = process.argv.includes('--yes');

const LEGACY_FESTIVAL_ID = 'modem-2026';
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');
const BACKUPS_DIR = join(__dirname, 'backups');

function timestamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

function initFirestore() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) throw new Error(`service-account.json fehlt: ${SERVICE_ACCOUNT_PATH}`);
  const admin = require('firebase-admin');
  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return { admin, db: admin.firestore() };
}

async function backupCollection(db, name) {
  const snap = await db.collection(name).get();
  const docs = snap.docs.map((d) => {
    const data = d.data();
    const plain = { ...data };
    if (plain.created_at?.toDate) plain.created_at = plain.created_at.toDate().toISOString();
    return { id: d.id, data: plain };
  });
  ensureDir(BACKUPS_DIR);
  const file = join(BACKUPS_DIR, `${name}-backup-${timestamp()}.json`);
  writeFileSync(file, JSON.stringify({ exported_at: new Date().toISOString(), doc_count: docs.length, docs }, null, 2));
  console.log(`[backup] ${docs.length} Dokumente aus "${name}" -> ${file}`);
  return docs;
}

async function main() {
  console.log(isWrite && hasYes ? 'Modus: WRITE (schreibt tatsächlich)' : 'Modus: DRY RUN (liest nur)');
  const { db } = initFirestore();

  const crewDocs   = await backupCollection(db, 'crew_connections');
  const inviteDocs = await backupCollection(db, 'crew_invites');

  const crewsToMigrate   = crewDocs.filter((d) => d.data.festival_id == null);
  const invitesToMigrate = inviteDocs.filter((d) => d.data.festival_id == null);

  console.log('');
  console.log(`[crew_connections] ${crewsToMigrate.length}/${crewDocs.length} ohne festival_id:`);
  crewsToMigrate.forEach((d) => console.log(`  - ${d.id} "${d.data.name || '(namenlos)'}" Mitglieder: ${(d.data.members || []).length}`));

  console.log('');
  console.log(`[crew_invites] ${invitesToMigrate.length}/${inviteDocs.length} ohne festival_id:`);
  invitesToMigrate.forEach((d) => console.log(`  - ${d.id} creator=${d.data.creator_uid} used=${d.data.used}`));

  console.log('');
  console.log(`Würde beiden Gruppen festival_id: "${LEGACY_FESTIVAL_ID}" setzen.`);

  if (!isWrite) {
    console.log('\nDRY RUN abgeschlossen — nichts geschrieben.');
    console.log('Zum Schreiben: node migrate-crew-festival.js --write --yes');
    return;
  }
  if (!hasYes) {
    console.log('\n[abgebrochen] --write ohne --yes: es wurde NICHTS geschrieben.');
    return;
  }

  const batch = db.batch();
  crewsToMigrate.forEach((d) => batch.update(db.collection('crew_connections').doc(d.id), { festival_id: LEGACY_FESTIVAL_ID }));
  invitesToMigrate.forEach((d) => batch.update(db.collection('crew_invites').doc(d.id), { festival_id: LEGACY_FESTIVAL_ID }));
  await batch.commit();
  console.log(`\n[write] ${crewsToMigrate.length} crew_connections + ${invitesToMigrate.length} crew_invites migriert.`);
}

main().catch((err) => {
  console.error('[FEHLER]', err.message);
  process.exit(1);
});
