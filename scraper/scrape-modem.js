#!/usr/bin/env node
// ── HEARD Scraper — MODEM 2026 ──
//
// Scrapt Artists + SoundCloud-Links von den drei MODEM-Stage-Seiten
// und importiert sie direkt in Firebase Firestore.
//
// Setup:
//   1. cd scraper && npm install
//   2. Firebase Admin SDK Key herunterladen (Firebase Console → Projekteinstellungen
//      → Dienstkonten → Neuen privaten Schlüssel generieren) → als service-account.json speichern
//   3. npm run scrape          # scrapt und importiert
//   4. npm run scrape:dry-run  # scrapt nur, zeigt JSON ohne Import
//
// Ausgabe: artists.json (alle gefundenen Artists)

import axios   from 'axios';
import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const isDryRun = process.argv.includes('--dry-run');

// ── Konfiguration ──

const FESTIVAL_ID = 'modem-2026';

const STAGES = [
  { id: 'hive',  url: 'https://modemfestival.com/the-hive/'  },
  { id: 'swamp', url: 'https://modemfestival.com/the-swamp/' },
  { id: 'seed',  url: 'https://modemfestival.com/the-seed/'  }
];

// ── Scraping ──

async function scrapeStage(stage) {
  console.log(`[scraper] Lade ${stage.url} ...`);

  const { data: html } = await axios.get(stage.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HEARD-Scraper/1.0)'
    },
    timeout: 15000
  });

  const $ = cheerio.load(html);
  const artists = [];

  // MODEM-Seiten listen Artists als Links.
  // Jeder Artist-Link führt zu einer SoundCloud-URL.
  // Struktur (anpassen falls sich das HTML ändert):
  //   <a href="https://soundcloud.com/...">ARTISTNAME</a>
  //
  // Wir suchen alle Links deren href eine SoundCloud-URL ist.
  $('a[href*="soundcloud.com"]').each((_, el) => {
    const name = $(el).text().trim();
    const scUrl = $(el).attr('href')?.trim();

    if (!name || !scUrl) return;

    // Duplikate vermeiden
    if (artists.some(a => a.name.toLowerCase() === name.toLowerCase())) return;

    artists.push({
      name,
      stage:         stage.id,
      soundcloud_url: scUrl,
      festival_id:   FESTIVAL_ID
    });
  });

  // Fallback: Falls die Seite eine andere Struktur hat, alle Artists
  // als reinen Text suchen (ohne SoundCloud-Link)
  if (artists.length === 0) {
    console.warn(`[scraper] Keine SoundCloud-Links auf ${stage.url} gefunden.`);
    console.warn('[scraper] Versuche Fallback: suche Artist-Namen ohne Link...');

    // Typische MODEM-Struktur: Artists in <li> oder <p> Tags
    $('li, .artist, .lineup-item').each((_, el) => {
      const name = $(el).text().trim();
      if (name && name.length > 2 && name.length < 60) {
        artists.push({
          name,
          stage:         stage.id,
          soundcloud_url: null,
          festival_id:   FESTIVAL_ID
        });
      }
    });
  }

  console.log(`[scraper] ${stage.id}: ${artists.length} Artists gefunden`);
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

  // Firebase Admin dynamisch laden (funktioniert mit ESM)
  const require = createRequire(import.meta.url);
  const admin = require('firebase-admin');

  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  const db = admin.firestore();
  const batch = db.batch();

  artists.forEach(artist => {
    const ref = db.collection('artists').doc();
    batch.set(ref, {
      ...artist,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log(`[scraper] ${artists.length} Artists in Firestore importiert.`);
}

// ── Hauptprogramm ──

async function main() {
  console.log('='.repeat(50));
  console.log('HEARD Scraper — MODEM 2026');
  console.log(isDryRun ? '(DRY RUN — kein Import)' : '(LIVE — importiert in Firebase)');
  console.log('='.repeat(50));

  const allArtists = [];

  for (const stage of STAGES) {
    try {
      const artists = await scrapeStage(stage);
      allArtists.push(...artists);
      // Kurze Pause zwischen Requests
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`[scraper] Fehler bei ${stage.id}:`, err.message);
    }
  }

  console.log(`\n[scraper] Gesamt: ${allArtists.length} Artists über alle 3 Stages`);

  // JSON-Datei speichern (immer, auch ohne Import)
  writeFileSync('./artists.json', JSON.stringify(allArtists, null, 2));
  console.log('[scraper] artists.json gespeichert');

  if (isDryRun) {
    console.log('\n[scraper] DRY RUN abgeschlossen — kein Import durchgeführt.');
    console.log('[scraper] Überprüfe artists.json und starte ohne --dry-run für den Import.');
    return;
  }

  console.log('\n[scraper] Importiere in Firebase...');
  await importToFirebase(allArtists);

  console.log('\n✓ Fertig! Artists sind jetzt in Firestore verfügbar.');
  console.log('  Nächster Schritt: App öffnen und Artists prüfen.');
}

main().catch(err => {
  console.error('[scraper] Kritischer Fehler:', err);
  process.exit(1);
});
