# MOYN Timetable Import — Runbook für heute

## Stand (24.08., zwei Flyer-Fotos verarbeitet)

- **229 von 330 Artists** haben jetzt `stage`/`day`/`time_start`/`time_end` in Firestore.
- **Gewächshaus (alle 4 Nächte) + Oase/Scapula (Do)** — 21 Artists, Zeiten **fest**, direkt vom Foto (jeder Act hatte eine explizite Uhrzeit dran).
- **7 Bühnen von Flyer 2** (Jekke Jolle, Extravaganza Speziale, Wilde Hilde, Playground, Diskotheka, Magischer Bazar, Zentralbar) — 208 Artists, Zeiten **geschätzt** (1h-Slots ab 20:00 Do/Fr/Sa, 1,5h-Slots ab 15:00 So; Reihenfolge = Foto). Die beiden Afterhour-Fußzeilen (Wilde Hilde So, Magischer Bazar So) haben echte Zeiten, keine Schätzung.
- `FESTIVAL_STAGE_LABELS['moyn-2026']` in `js/app.js` ist ergänzt — Stage-Badges zeigen jetzt schöne Namen statt roher IDs.
- **Noch offen / nicht eingetragen:**
  - **Dome-Bühne**: nur Ambient-Blöcke + Workshops (Yoga, Breathwork etc. — keine Namen zum Matchen) und 5 Sonntag-Live-Konzerte (Jan Benkest, Sacred Fool, Wahnschaffe, Tinie Creatures, Eskalin) — für die Konzerte hatte ich keine verlässliche Uhrzeit im Foto, absichtlich nicht geschätzt.
  - **Outdoor Oase / Gewächshaus-Workshops tagsüber**: keine Uhrzeiten im Foto, keine DB-Matches zu erwarten (keine "Artists" im klassischen Sinn).
  - **Performance/Kunst-Programm** (Moynege, Cozy, Auf dem Gelände, Am Festivaleingang, Secret Place — Kaddi Kippenberger, L'Exposition, Ohrenzirkus, Chapeau Club, Zeitraumgestalter, XStage, Dirrrty Bingo, Kalayo Fire Collective, Hummelrummel & Istari Varieté, Hit Happens, Sound und Gemüse, Daddy Loenslers Twister Opening, Luft-Varieté, Clara Hanzal & Phileas Fiorino, Livepainting with Hildescrime u.a.) — auf Wunsch komplett ausgelassen, da die meisten noch nicht in der DB sind und laut Daniel noch mehr Acts nachkommen. Eigener Durchgang, wenn die Liste steht.
  - **10 unmatched aus Flyer 2** (nicht angelegt, nur im Report): Denis Keiner b2b Niko Kijewski, Matasten, Fonattack (solo, DB hat nur "Kronik b2b Fonattack"), Ben Glock, Isis Lutz (DB: "Isis"), Julez & Luk The Dude (DB: "Julez"), Timboletti, Aze49, Mirko Machine, Jekke Jolle Allstars.
  - Aus dem Gewächshaus-Batch unmatched: "Dave Dinger" solo (DB: "Avocado & Dave Dinger" als Duo), "Phae (Ambient Set)" (DB: ")Phae"), "Honigkater" (komplett neu).
  - Kaddi Kippenberger taucht **zweimal** auf: als roaming Kunst-Act *und* als regulärer Slot auf Playground Sa 22:00-23:00 (geschätzt) — der Playground-Slot ist mit drin, der Kunst-Act nicht.
- **Wichtigste Annahme, die noch zu prüfen ist**: Jekke Jolle & Extravaganza Speziale haben laut Flyer 2 **keinen Freitag-Block** (keine Liste auf dem Foto) — angenommen, die beiden Bühnen sind freitags dark. Falls falsch: Freitag-Zeilen nachtragen.
- Reports zu allen Runs liegen in `scraper/reports/`, Backups in `scraper/backups/` (beide gitignored, aber lokal vorhanden — der Report mit den `notes`-Feldern zeigt genau, welcher Eintrag geschätzt vs. fest ist).


**An Claude, falls diese Session abgebrochen ist und du das hier frisch liest:**
Daniel ist auf dem Weg zum MOYN Festival und schickt dir Fotos vom Timetable
(Boards/Pläne vor Ort). Deine Aufgabe: daraus die Zeiten für die MOYN-Artists in
Firestore eintragen. Alles Nötige ist vorbereitet und getestet — hier ist der
komplette Ablauf.

## Ausgangslage

- 330 MOYN-Artists stehen schon in Firestore (`artists`-Collection, `festival_id: "moyn-2026"`), importiert aus dem Line-up (siehe `scraper/scrape-moyn.js` und den WILDE-Import von vorher).
- **Keiner davon hat aktuell `day`/`time_start`/`time_end`** — alle stehen mit `stage: "main"` drin (Platzhalter). Das trägst du jetzt nach.
- Die offizielle Line-up-Seite (`moynfestival.de/line-up/`) ist offline (404) — kein digitales Timetable auffindbar, nur die "Rausgegangen"-App (keine granularen Zeiten). Fotos sind der einzige Weg.
- Zeitformat in der App: Dezimalstunden, **Mitternachts-Wrap ohne Werte über 24** (bestätigt anhand der echten MODEM-Daten: z.B. `time_start: 23, time_end: 1` für 23:00–01:00 — NICHT `time_end: 25`).

## Schritt für Schritt

1. **Fotos ansehen** und pro Auftritt einen Eintrag notieren: Name (wie auf dem Foto/Board geschrieben), Stage/Floor-Name (Klartext, z.B. "Hilde"), Tag (`monday`..`sunday`, englisch), Start- und Endzeit als Dezimalstunden.

2. **Eintragen in `scraper/moyn-timetable-input.json`** (existiert noch nicht, neu anlegen — ist `.gitignore`t, wird nie committed). Format:
   ```json
   [
     { "name": "Acid Pauli", "stage": "Hilde", "day": "thursday", "time_start": 23, "time_end": 24.5 },
     { "name": "Caren Callas", "stage": "Speziale", "day": "friday", "time_start": 2, "time_end": 3.5 }
   ]
   ```
   Namen möglichst so schreiben wie auf dem Foto — die Namens-Normalisierung im Script gleicht Umlaute/Sonderzeichen/Groß-Klein-Schreibung sowieso automatisch ab.

3. **Dry-Run:**
   ```bash
   cd scraper
   node import-moyn-timetable.js
   ```
   Zeigt: was aktualisiert würde, was nicht gematcht wurde (mit Näherungs-Vorschlägen bei Tippfehlern, z.B. "meinst du: Kaddi Kippenberger?"), welche Stages neu entdeckt wurden. **Schreibt noch nichts.**

4. **Kurz mit Daniel gegenchecken** (Anzahl Updates plausibel? Unmatched-Liste kurz überfliegen — bei Tippfehlern einfach den Namen in der JSON-Datei korrigieren und Dry-Run wiederholen).

5. **Schreiben:**
   ```bash
   node import-moyn-timetable.js --write --yes
   ```
   Macht vorher automatisch ein volles Backup der `artists`-Collection (`scraper/backups/`). Schreibt in 400er-Chunks — bei Verbindungsabbruch mittendrin: **einfach nochmal laufen lassen**, ist idempotent (schreibt dieselben Zielwerte erneut, nichts wird doppelt oder falsch).

6. **Falls echte neue Artists dabei sind** (auf dem Foto, aber nicht in der DB — z.B. Main-Stage-Acts, die der ursprüngliche Scraper nicht erfasst hat): nochmal mit `--create-unmatched` zusätzlich anhängen, dann werden die unmatched-Einträge als neue Artists angelegt statt nur gemeldet.

7. **Nachgang (klein, kein Blocker):** Falls neue Stage-Namen entdeckt wurden, ergänzt das Script automatisch `festivals/moyn-2026.stages` in Firestore. Für schöne farbige Stage-Badges (aktuell nur `hive`/`swamp`/`seed` für MODEM eingefärbt, siehe `.stage-badge.hive/.swamp/.seed` in `css/style.css`) müsste noch `FESTIVAL_STAGE_LABELS` in `js/app.js` um `'moyn-2026': {...}` ergänzt werden — rein kosmetisch, App funktioniert auch ohne (Stage zeigt dann einfach die rohe ID statt eines schönen Namens).

## Falls unterwegs die Verbindung wegbricht

- Dry-Run UND Write brauchen beide kurz Netz (Firestore-Zugriff) — sonst nichts.
- Die eigentliche Fotoauswertung/JSON-Befüllung braucht kein Netz, kann offline vorbereitet werden.
- Jeder Schritt ist gefahrlos wiederholbar (idempotent), also: bei Abbruch einfach nochmal denselben Befehl.

## Falls diese VS-Code-Session komplett weg ist

Neue Claude-Code-Session im selben Repo-Ordner öffnen, dann: *"Lies scraper/MOYN_TIMETABLE_TODO.md und mach von dort weiter"*. `service-account.json` liegt bereits in `scraper/` (gitignored, aber lokal vorhanden) — kein erneutes Firebase-Setup nötig.
