#!/usr/bin/env node
// ── HEARD Scraper — MOYN Festival 2026 ──
//
// Scrapt Artists + SoundCloud-Links von der MOYN Line-up-Seite
// und importiert sie direkt in Firebase Firestore (inkl. Festival-Dokument).
//
// Setup:
//   1. cd scraper && npm install (falls noch nicht gemacht)
//   2. service-account.json in diesem Ordner vorhanden? (vom MODEM-Import)
//   3. npm run scrape:moyn:dry   # Dry-Run: zeigt JSON ohne Import
//   4. npm run scrape:moyn       # Importiert in Firebase
//
// Was importiert wird:
//   • festivals/moyn-2026 (Festival-Dokument)
//   • artists/...         (alle Artists mit festival_id: 'moyn-2026')

import axios   from 'axios';
import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const isDryRun = process.argv.includes('--dry-run');

// ── Konfiguration ──

const FESTIVAL_ID   = 'moyn-2026';
const FESTIVAL_NAME = 'MOYN Festival';
const LINEUP_URL    = 'https://moynfestival.de/line-up/';
const STAGE_ID      = 'main'; // MOYN-Seite trennt nicht nach Stages

// ── Scraping ──

async function scrapeLineup() {
  console.log(`[scraper] Lade ${LINEUP_URL} ...`);

  const { data: html } = await axios.get(LINEUP_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HEARD-Scraper/1.0)' },
    timeout: 20000
  });

  const $ = cheerio.load(html);
  const artists = [];

  // Präfixe die auf B2B-Suffixe oder Ergänzungs-Einträge hinweisen
  const SKIP_PREFIXES = /^(&\s|b2b\s|B2B\s|vs\.\s|Late Night\s)/i;
  const seenUrls = new Set();

  $('a[href*="soundcloud.com"]').each((_, el) => {
    const link = $(el);
    // Artist-Name: bevorzugt aus dem Text-Span, Fallback: gesamter Link-Text
    const nameRaw = link.find('.elementor-icon-list-text').text().trim()
                 || link.text().trim();
    const scUrl   = link.attr('href')?.trim();

    if (!nameRaw || !scUrl) return;

    // Soundcloud-Links ohne Pfad (nur Domain) überspringen
    const scPath = new URL(scUrl).pathname;
    if (scPath === '/' || scPath === '') return;

    // B2B-Suffixe und Event-Reihen überspringen
    if (SKIP_PREFIXES.test(nameRaw)) return;

    // Duplikat per SoundCloud-URL (Alias/Schreibvarianten desselben Artists)
    if (seenUrls.has(scUrl)) return;

    // Duplikat per Name
    if (artists.some(a => a.name.toLowerCase() === nameRaw.toLowerCase())) return;

    seenUrls.add(scUrl);
    artists.push({
      name:           nameRaw,
      stage:          STAGE_ID,
      soundcloud_url: scUrl,
      festival_id:    FESTIVAL_ID
    });
  });

  console.log(`[scraper] ${artists.length} Artists gefunden`);
  return artists;
}

// ── Firebase Import ──

async function importToFirebase(artists) {
  const serviceAccountPath = './service-account.json';

  if (!existsSync(serviceAccountPath)) {
    console.error(`
[scraper] FEHLER: ${serviceAccountPath} nicht gefunden!

So bekommst du den Key:
  1. Firebase Console → Projekteinstellungen → Dienstkonten
  2. "Neuen privaten Schlüssel generieren"
  3. Datei als scraper/service-account.json speichern

WICHTIG: service-account.json NIEMALS in Git committen!
    `);
    process.exit(1);
  }

  const require = createRequire(import.meta.url);
  const admin   = require('firebase-admin');

  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const db = admin.firestore();

  // Festival-Dokument anlegen / überschreiben
  await db.collection('festivals').doc(FESTIVAL_ID).set({
    name:       FESTIVAL_NAME,
    location:   'Deutschland',
    stages:     [STAGE_ID],
    created_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log(`[scraper] Festival "${FESTIVAL_NAME}" (ID: ${FESTIVAL_ID}) angelegt`);

  // Artists in Batches importieren (Firestore-Limit: 500 pro Batch)
  const BATCH_SIZE = 400;
  let imported = 0;

  for (let i = 0; i < artists.length; i += BATCH_SIZE) {
    const batch = db.batch();
    artists.slice(i, i + BATCH_SIZE).forEach(artist => {
      const ref = db.collection('artists').doc();
      batch.set(ref, { ...artist, created_at: admin.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
    imported += Math.min(BATCH_SIZE, artists.length - i);
    console.log(`[scraper] ${imported}/${artists.length} Artists importiert...`);
  }

  console.log(`[scraper] Fertig: ${imported} Artists in Firestore.`);
}

// ── Hauptprogramm ──

async function main() {
  console.log('='.repeat(50));
  console.log(`HEARD Scraper — ${FESTIVAL_NAME}`);
  console.log(isDryRun ? '(DRY RUN — kein Import)' : '(LIVE — importiert in Firebase)');
  console.log('='.repeat(50));

  const artists = await scrapeLineup();

  if (artists.length === 0) {
    console.error('[scraper] Keine Artists gefunden — Import abgebrochen.');
    process.exit(1);
  }

  // JSON-Datei immer speichern (zum Prüfen)
  const outFile = './moyn-artists.json';
  writeFileSync(outFile, JSON.stringify(artists, null, 2));
  console.log(`[scraper] ${outFile} gespeichert — bitte kurz reinschauen!`);

  if (isDryRun) {
    console.log('\n── DRY RUN abgeschlossen ──');
    console.log('Ergebnis sieht gut aus? Dann: npm run scrape:moyn');
    return;
  }

  console.log('\n[scraper] Importiere in Firebase...');
  await importToFirebase(artists);

  console.log('\n✓ Fertig! Nächste Schritte:');
  console.log('  1. App öffnen → Profil → Festival wechseln → "MOYN Festival"');
  console.log('  2. Artists prüfen und ggf. Stage-Namen in Firebase anpassen');
}

main().catch(err => {
  console.error('[scraper] Kritischer Fehler:', err);
  process.exit(1);
});
