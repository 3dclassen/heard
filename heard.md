HEARD — Product Requirements Document
Version: 0.13 Stand: April 2026 Autor: Daniel Classen Status: Prototyp live (v0.13) — Sprint 6d fertig (Fixes + MOYN Import)

Dieses Dokument ist das zentrale Pflichtenheft für HEARD. Es wird bei jeder Session in VS Code als Kontext mitgegeben, damit Claude den aktuellen Stand kennt und korrekte Entscheidungen trifft.

1. Vision & Ziel
   Ein Festival-Companion der dir hilft, das Line-Up eines Festivals vorab zu hören, zu bewerten und daraus deinen persönlichen Timetable zu bauen — gemeinsam mit deinen Festivalbegleiter\*innen.

Kern-Versprechen: Nie wieder Artists verpassen weil du nicht weisst wer gut ist.

2. Kontext & Ausgangslage
   Bisher: Line-Up manuell durchgehört, Excel-Tabelle gepflegt, ausgedruckt, fotografiert, als Foto auf dem Handy mitgenommen. Kein Vergleich mit Festivalbegleiter\*innen möglich.

Aktive Festivals im Prototyp:

MODEM Festival 2026 (Kroatien, Juli 2026)
  Stages: The Hive, The Swamp, The Seed
  Line-Up: https://modemfestival.com/the-hive/ | /the-swamp/ | /the-seed/
  Artists + SoundCloud-Links via Scraper in Firebase. Timetable folgt Juli 2026.

MOYN Festival 2026 (Deutschland)
  Line-Up: https://moynfestival.de/line-up/
  83 Artists via Scraper importiert (scraper/scrape-moyn.js). Stages werden
  nachgetragen sobald MOYN sie veröffentlicht (Batch-Update-Script, Ratings bleiben erhalten).

3. Zielgruppe
   Prototyp: Daniel + 3 Festivalbegleiter*innen (4 User)
   v1: Beliebig viele Nutzer\*innen, mehrere Festivals
   Technisches Niveau: Normale Smartphone-Nutzung, kein technisches Wissen erforderlich

4. Die zwei Phasen der Nutzung
   Phase 1 — Vor dem Festival (mit Internet)
   Artists vorhören, Ratings + Kommentare vergeben. Firebase synchronisiert alle Daten. Alle Crew-Mitglieder sehen die Bewertungen der anderen in Echtzeit. Wenn MODEM den Timetable veröffentlicht: Admin trägt Zeiten ein → alle sehen sofort den Timetable.
   Phase 2 — Auf dem Festival (KEIN Internet)
   App läuft vollständig offline via PWA + Service Worker. Beim letzten Online-Besuch wurden alle Daten lokal gecacht. Offline-Auth via Passphrase (kein Google Login nötig). Neue Ratings werden lokal gepuffert und beim nächsten Internet-Kontakt synchronisiert.

5. Architektur
   Frontend: GitHub Pages (PWA — reines HTML/CSS/JS, keine Frameworks)

Datenbank: Firebase Firestore (Spark Plan, kostenlos)

Authentication: Firebase Auth (Google Login) + Offline-Auth (Passphrase)

Offline: Service Worker + localStorage Cache

Scraper: Node.js Script (lokal, einmalig ausführen)

Hosting: github.com/3dclassen/heard

Live: https://3dclassen.github.io/heard/

Warum kein Framework (React/Vue)? Keine Build-Pipeline nötig, direkt auf GitHub Pages lauffähig, einfacher zu debuggen.

Warum Firebase? Direkte DB-Zugriffe aus dem Frontend, kein eigener Server, kostenfrei im Spark Plan, bereits beim Cycle Tracker und Windsurf Finder erfolgreich eingesetzt.

6. Projektstruktur
   heard/

├── index.html ← Artist-Liste, Filter, Rating

├── timetable.html ← Persönlicher Timetable

├── crew.html ← Crew-Vergleich

├── admin.html ← Admin-Bereich (geschützt)

├── css/

│ ├── design-tokens.css ← ⚡ ZENTRALES DESIGN SYSTEM (neu, Sprint 4)

│ └── style.css ← Alle Komponenten (referenziert design-tokens.css)

├── js/

│ ├── app.js ← Hauptlogik, Filter, Sort, Rating-Panel, Avatar-Chips

│ ├── firebase.js ← Firebase SDK, Auth, Firestore, Crew-Funktionen

│ ├── offline-auth.js ← ⚡ Passphrase-Auth für Festival (neu, Sprint 5)

│ ├── rating.js ← Berechnungen: avgRating, sharedFavorites

│ ├── timetable.js ← Timetable-Generierung, Konflikt-Erkennung

│ ├── crew.js ← Crew-Seite, Invite-Flow, Crew-Ratings

│ ├── sync.js ← Offline-Sync, localStorage Cache

│ └── admin.js ← Admin-Funktionen

├── scraper/

│ ├── scrape-modem.js ← Node.js: MODEM-Seiten → Firebase (bereits ausgeführt)

│ └── package.json

├── sw.js ← Service Worker (Cache: heard-v7)

├── manifest.json ← PWA Manifest

├── icons/

│ ├── icon-192.png

│ └── icon-512.png

└── README.md

7. Datenmodell (Firebase Firestore)
   7.1 festivals/{festivalId}
   Feld
   Typ
   Beschreibung
   id
   string
   Auto (Firebase)
   name
   string
   z.B. "MODEM 2026"
   location
   string
   z.B. "Kroatien"
   date_start
   date
   Startdatum
   date_end
   date
   Enddatum
   stages
   array
   ["hive", "swamp", "seed"]
   lineup_urls
   object
   Stage → Scraper-URL
   created_by
   string
   Firebase Auth UID des Admins

7.2 artists/{artistId}
Feld
Typ
Beschreibung
id
string
Auto (Firebase)
name
string
z.B. "GRUB"
stage
string
"hive", "swamp", "seed"
soundcloud_url
string
Von MODEM-Website gescrapt
modem_profile_url
string
Link zum Artist-Profil
day
string
"monday" etc. — kommt mit Timetable
time_start
number
Dezimalstunden (23.0 = 23:00)
time_end
number
Dezimalstunden (1.0 = 01:00 Folgetag)
festival_id
string
Referenz auf Festival
created_at
timestamp
Auto

7.3 ratings/{ratingId}
Feld
Typ
Beschreibung
id
string
Auto (Firebase)
artist_id
string
Referenz auf Artist
user_id
string
Firebase Auth UID
rating
number
1–5 Sterne (0 = nicht bewertet)
comment
string
Freitext-Kommentar
listened
boolean
Reingehört?
want_to_see
boolean
Favorit / Im Timetable merken
seen
boolean
⚡ Auf Festival gesehen (neu, Sprint 6)
updated_at
timestamp
Auto

7.4 users/{userId}
Feld
Typ
Beschreibung
uid
string
Firebase Auth UID
display_name
string
Anzeigename
email
string
Google-Account E-Mail
photo_url
string
Google-Profilbild
role
string
"admin" oder "viewer"
active_festival_id
string
⚡ Aktuell aktives Festival (neu, Sprint 6)
offline_auth_hash
string
⚡ SHA-256 Hash der Passphrase (neu, Sprint 5)

7.5 crews/{crewId}
Feld
Typ
Beschreibung
id
string
Auto (Firebase)
name
string
Crew-Name (z.B. "Die Hive-Fraktion")
code
string
Wiederverwendbarer 6-stelliger Code
members
array
Liste aller UIDs
created_by
string
UID des Erstellers (= Admin)
festival_id
string
Referenz auf Festival
created_at
timestamp
Auto

Hinweis: Pro Festival ist ein User in max. einer Crew. crew_connections und crew_invites sind deprecated (Altdaten, werden nicht mehr gelesen).

8. Firebase Security Rules
   rules_version = '2';

service cloud.firestore {

match /databases/{database}/documents {

    match /festivals/{festivalId} {

      allow read: if request.auth != null;

      allow write: if request.auth != null &&

        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';

    }

    match /artists/{artistId} {

      allow read: if request.auth != null;

      allow write: if request.auth != null &&

        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';

    }

    match /ratings/{ratingId} {

      allow read: if request.auth != null;

      allow write: if request.auth != null &&

        request.resource.data.user_id == request.auth.uid;

    }

    match /users/{userId} {

      allow read: if request.auth != null;

      allow write: if request.auth != null && request.auth.uid == userId;

    }

    match /crews/{crewId} {

      allow read: if request.auth != null &&

        request.auth.uid in resource.data.members;

      allow create: if request.auth != null &&

        request.auth.uid in request.resource.data.members &&

        request.resource.data.created_by == request.auth.uid;

      allow update: if request.auth != null &&

        request.auth.uid in resource.data.members;

      allow delete: if request.auth != null &&

        request.auth.uid in resource.data.members;

    }

}

}

9. Features & Status
   ✅ Sprint 1–3 — Fertig und live
   Google Login (Firebase Auth), automatisches User-Profil
   Artist-Liste: Filter (Stage, Status), Suche, Sortierung (A–Z, ★↓ etc.)
   Rating: 1–5 Sterne, Reingehört-Toggle, Favorit-Toggle, Kommentar
   Avatar-Chips auf Artist-Karten (andere User die bewertet haben)
   Crew-System: Invite-Code (6-stellig, Einmal-Code), bidirektionale Verbindung
   Crew-Ansicht: nur verbundene Members, Shared Favorites, Crew-Ratings
   Persönlicher Timetable: Favoritenliste (Zeiten folgen Juli 2026)
   Konflikt-Erkennung (sobald Zeiten vorhanden)
   PWA: installierbar iOS + Android, Offline via Service Worker + localStorage
   Admin-Bereich: Festival anlegen, Artists bearbeiten, User-Rollen verwalten
   Scraper: Artists + SoundCloud-Links von MODEM 2026 bereits in Firebase
   ✅ Sprint 4 — Design System & Tile-Layout (FERTIG, v0.8)
   design-tokens.css — zentrales Design System angelegt (css/design-tokens.css):
   Alle CSS-Variablen extrahiert aus style.css + neue Sprint-4-Tokens:
   --tile-height, --tile-border-radius, --space-xs/sm/md/lg, --font-size-sm/md/lg/xl
   style.css importiert jetzt design-tokens.css via @import

   Tile-Überarbeitung umgesetzt:
   - Alle Tiles min-height: 120px (3-Zeilen-Grid: Name / Meta / Comment)
   - Artist-Name mit text-overflow: ellipsis bei Überlänge
   - Kommentar-Vorschau: eigener Kommentar (weiß/kursiv) zuerst, sonst Crew-Kommentar ausgegraut (Vorname: Text)
   - Crew-Chips prominenter: "CREW" Label in Akzentfarbe, accent-farbige Initialen, hellerer Border
   - SW-Cache: heard-v8, APP_VERSION: 0.8

   Nachträglich aus Sprint 6 vorgezogen:
   - "Gesehen"-Toggle im Artist-Panel implementiert (seen: boolean in Firebase)
   - Panel visuell in zwei Bereiche getrennt:
     "Vor dem Festival" (Reingehört + Favorit) und "Auf dem Festival" (Gesehen ✓)
     → gestrichelte lila Border macht den Kontextwechsel klar
   - firebase.js: saveRating unterstützt seen-Feld
   - Offline-Cache ebenfalls seen-aware

✅ Sprint 5 — Offline-Auth (FERTIG, v0.10)
Passphrase-System (offline-auth.js):

Beim ersten Login (mit Internet):

- App schlägt automatisch nach 1,5s Passphrase-Setup vor (nicht blockierend, aber hartnäckig)
- Vorschlag wird aus Favoriten generiert: "Daniel will GRUB unbedingt live sehen"
- User tippt auf Vorschlag → übernehmen, oder eigene Passphrase eingeben (min. 6 Zeichen)
- User bestätigt Passphrase (zweimal eingeben)
- App berechnet SHA-256(passphrase) → speichert Hash in localStorage UND Firebase (users/{uid}/offline_auth_hash)
- Passphrase selbst wird NIEMALS gespeichert
- UX-Hinweis: "Schreib sie auf oder schick sie dir per WhatsApp"

Auf dem Festival (ohne Internet):

- App erkennt: kein Internet → zeigt Offline-Login-Screen
- Personalisierte Begrüßung: "Hey Daniel. Du bist offline."
- User gibt Passphrase ein → SHA-256 → Vergleich mit lokalem Hash
- Bei Match: gecachte Daten (Artists, Ratings, Users) aus localStorage geladen, App läuft voll

Profil-Modal:

- Zeigt Passphrase-Status (✓ grün / ⚠ gelb)
- "Ändern"-Button öffnet Setup erneut

80s-Quotes eingebaut (v0.9):

- Kommentar-Placeholder im Rating-Panel (zufällig, wechselnd)
- Toast nach 5★ Rating: A-Team / MacGyver
- Toast nach 1★ Rating: Al Bundy / ALF
- Offline-Login erfolgreich: Terminator / Knight Rider / Dirty Dancing
- Passphrase-Setup: ALF / MacGyver / Al Bundy
- Empty State ohne Daten: Colt Sievers
✅ Sprint 6a — Crew-Fixes + Auto-Refresh (FERTIG, v0.10)
  - Crew-Ansicht: Sterne-über-Tiles-Bug behoben (display:flex-Fix)
  - Crew-Ansicht: Kommentare jetzt sichtbar in der Artist-Liste
  - Auto-Refresh: onSnapshot-Listener für Ratings + Users triggern jetzt render() — Änderungen von Crew-Mitgliedern sofort sichtbar
  - Crew-Code: Invite-Code jedes Crew-Members auf seiner Kachel sichtbar + kopierbarer Button
  - Klickbare Crew-Kachel: Kachel eines Mitglieds anklicken → gefilterte Ansicht nur seiner Bewertungen. Lila Banner zeigt aktiven Filter. ✕ zum Zurücksetzen.

✅ Sprint 6b — Mehrere Festivals + Festival-Switcher (FERTIG, v0.11)
  Festival-Switcher:
  - active_festival_id im User-Profil (Firebase)
  - Profil-Menü zeigt aktives Festival (Name + Ort) mit "Wechseln"-Button
  - Festival-Panel: Liste aller Festivals, aktives markiert mit ✓
  - Wechseln → alle Listener stoppen, neues Festival aktiv, Artists + Ratings neu laden
  - Nav-Pill zeigt aktiven Festival-Namen, klickbar → öffnet Festival-Switcher

  Neues Festival anlegen:
  - 8 Vorlagen: MODEM, Gondwana, Ozora, Fusion, Bucht der Träumer, Drops, Master of Puppets, MOYN + "Manuell"
  - Vorlage wählen → Name + Ort auto-befüllt, Stages gesetzt
  - Anlegen → Firebase-Dokument erstellt, sofort aktiv

  Dynamische Stage-Filter:
  - Stage-Pills aus Festival.stages geladen (nicht mehr hardcoded)
  - MODEM: weiterhin "The Hive / The Swamp / The Seed"
  - Andere Festivals: deren Stage-Namen

  Alle Seiten (index, crew, timetable): lesen active_festival_id aus User-Profil

  "Gesehen"-Checkbox: ✅ bereits in Sprint 4 umgesetzt
✅ Sprint 6c — Crew-Modell Migration (FERTIG, v0.12)
  Neues Datenmodell crews/{crewId}:
  - Eine Crew = ein persistenter Code für alle Members
  - Crew-Name auf der Crew, nicht pro User
  - Admin = Ersteller (kann Code neu generieren)
  - Crew verlassen: Members-Array aktualisiert, leere Crew wird gelöscht, Admin-Transfer bei Verlassen
  - Pro Festival: max. eine Crew pro User (Schutz in joinCrewByCode + createCrew)

  UI-States:
  - Noch keine Crew: "Crew erstellen" (Name eingeben) ODER "Beitreten" (Code eingeben)
  - In einer Crew: Name, Members, Code (Kopieren + Neu generieren für Admin), Crew verlassen
  - Crew-Admin erkennbar am ★ auf der Mitglieder-Kachel

  Deprecated (nicht gelöscht, werden aber nicht mehr gelesen):
  - crew_connections Collection
  - crew_invites Collection
  - users.invite_code Feld
  - users.crew_name Feld

✅ Sprint 6d — Fixes + MOYN Import (FERTIG, v0.13)
  Navigation & Responsive:
  - Logo "HEARD" → "HD" auf Screens < 480px (CSS: .nav-logo-ear wird versteckt)
  - Logo ist jetzt Link auf index.html (alle Seiten)
  - Nav-Links kompakter auf Mobile (kleinere Padding + Schrift)
  - Festival-Pill auf 72px begrenzt auf Mobile
  - Profile-Email: word-break fix (kein Overflow mehr im Profil-Panel)
  - Invite-Code-Display: flex-wrap auf kleinen Screens (Code + Buttons umbrechen)
  - Bekanntes Restproblem: Nav auf sehr kleinen Screens (< 360px) noch leicht zu breit
    → Lösung: Icons oder Burger-Menü (niedrige Prio, nach MODEM)

  Crew Member Filter UX:
  - Klick auf Crew-Mitglied → automatischer Smooth-Scroll zur Bewertungsliste
  - Vorher: Filter war aktiv aber nicht sichtbar (man musste selbst scrollen)

  MOYN Festival:
  - scraper/scrape-moyn.js erstellt: scrapt https://moynfestival.de/line-up/
  - Bereinigung: 99 → 83 Artists (B2B-Suffixe, doppelte SoundCloud-URLs, Event-Reihen entfernt)
  - festivals/moyn-2026 + 83 Artists in Firebase importiert
  - MOYN zu FESTIVAL_TEMPLATES in app.js hinzugefügt (Stages: main/forest/silent als Platzhalter)
  - npm run scrape:moyn:dry / scrape:moyn als Scripts in scraper/package.json

  Festival-Switcher Bug Fix:
  - festivals/modem-2026 Dokument fehlte in Firestore (Scraper hatte nur Artists angelegt)
  - MODEM erschien deshalb nicht in der Festival-Wechseln-Liste
  - Dokument nachträglich angelegt → MODEM ↔ MOYN Wechsel funktioniert

  Firebase Security Rules:
  - crews Collection: read/create/update/delete für Members, create nur mit creator_uid == auth.uid
  - crew_invites + crew_connections Rules entfernt (deprecated)

🔲 Sprint 7 — Timetable Admin-Flow
Wenn MODEM den Timetable veröffentlicht (Juli 2026):

Admin fotografiert Timetable
Foto wird im Admin-Bereich hochgeladen
Claude Vision API analysiert das Bild → gibt JSON zurück (artist, stage, day, time_start, time_end)
Admin prüft Ergebnis in einer Tabelle → korrigiert bei Bedarf → bestätigt
Daten gehen in Firebase → alle Nutzer sehen sofort den vollständigen Timetable

Kein kollaboratives Editing, kein Drag & Drop im Prototyp. Admin hat vollständige Kontrolle.

10. Entschiedene Architektur-Fragen
    Thema
    Entscheidung
    Design System
    Jetzt anlegen: design-tokens.css
    Offline-Auth
    Passphrase + SHA-256, eigenes Modul offline-auth.js
    Crew-Modell
    crews/{id}: ein Code für alle, Members-Array, Admin = Ersteller, max. 1 Crew pro Festival pro User
    Timetable
    Admin-only, kein kollaboratives Editing
    Mehrere Festivals
    active_festival_id im User-Profil, Festival-Templates in Firebase
    Monetarisierung
    PayPal.me im Footer für Spenden, Stripe erst nach MODEM wenn nötig
    Frameworks
    Keine — reines HTML/CSS/JS

11. Bekannte Bugs & offene Punkte
    Microsoft Login Error (ungelöst)
    Login schlägt fehl nach korrektem Azure + Firebase Setup. Wahrscheinlich fehlt noch eine Konfiguration in Azure (z.B. API permissions oder Redirect URI Mismatch). Nächste Session debuggen.

    Nav auf sehr kleinen Screens (< 360px) noch leicht zu breit (Kosmetik)
    Alle 3 Links passen knapp nicht. Lösung: Icons oder Burger-Menü. Niedrige Prio — nach MODEM angehen.

    MOYN Stages fehlen noch
    Alle 83 Artists haben stage: 'main'. Sobald MOYN die Stages veröffentlicht:
    1. Mapping erstellen (Artist → Stage), z.B. als Liste
    2. Batch-Update-Script ausführen (Ratings bleiben dabei 100% erhalten — Rating-Dokumente
       referenzieren nur artist_id, nicht den Stage-Namen)
    3. festivals/moyn-2026 stages-Array aktualisieren

    Bereits gelöste Bugs
    ✅ Festival-Switcher: MODEM fehlte in der Liste (festivals/modem-2026 Dokument nachgelegt)
    ✅ Weißes Rechteck auf Desktop (unbekannt wann gelöst)
    ✅ Service Worker Cache-Invalidierung (automatisches Update alle 60s)
    ✅ img src="" Bug im Profil-Panel
    ✅ APP_VERSION / SW-Version Mismatch

12. Backlog (nach MODEM)
    Feature
    Aufwand
    Prio
    ✅ Crew-Modell Migration: ein Code für alle
    —
    v0.12
    Crew-Match zwischen fremden Crews (Ähnlichkeits-Score) — DETAILKONZEPT UNTEN
    Mittel
    v1
    Drag & Drop Timetable
    Hoch
    v1
    Festival-Buch PDF Export
    Hoch
    v1
    Community SoundCloud-Links vorschlagen
    Niedrig
    v1
    KI-gestützter Lineup-Import (URL eingeben → Claude analysiert)
    Mittel
    v1
    Apple / Microsoft Login
    Niedrig
    v1
    Push-Benachrichtigung ("GRUB spielt in 30 Min!")
    Mittel
    v2
    WhatsApp/Signal Deeplink für Crew-Match
    Niedrig
    v2
    Premium Features via Stripe
    Mittel
    v2

12a. Crew-Modell Migration — ABGESCHLOSSEN (v0.12)
Umgesetzt in Sprint 6c. Crew-Mitgliedschaft wird aus dem crews-Dokument abgeleitet
(members-Array enthält UID). Kein crew_id-Feld im User-Profil nötig — Lookup via
Firestore-Query: where('members', 'array-contains', uid).

12b. Crew-Match — Detailkonzept (v1, nach MODEM, setzt 12a voraus)
Idee: Fremde Crews mit ähnlichen musikalischen Vorlieben/Timetables finden und kennenlernen.

Matching-Logik:

- Basis: Überschneidung der want_to_see-Artists zwischen zwei Crews
- Score: (gemeinsame Favoriten) / (Vereinigung aller Favoriten) = Jaccard-Ähnlichkeit
- Anzeige: Nicht als %-Zahl sondern als 80er-Referenz-Skala:
  - 0–20%: "Das reicht für einen Händedruck, MacGyver."
  - 21–40%: "Ähnlich wie Knight Rider und ein normales Auto."
  - 41–60%: "1.21 Gigawatt Potenzial." ← SWEET SPOT
  - 61–80%: "Ich liebe es wenn ein Plan funktioniert."
  - 81–100%: "TURBO BOOST. Das ist euer Match."

Match-Flow (Tinder-Mechanismus):

1. User sieht anonymisierte andere Crews mit Score ("Crew XY — 1.21 Gigawatt Potenzial")
2. User sendet Match-Anfrage (generiert einmaligen Code)
3. Andere Crew sieht Anfrage, akzeptiert mit eigenem Code
4. Beide Codes getauscht → Match bestätigt
5. App generiert vorbereiteten WhatsApp-Deeplink:
   "Hey! Wir sind Crew [Name] — HEARD hat uns gematcht (1.21 Gigawatt ⚡).
   Wann und wo sehen wir uns? 🎵"
   → Kein eigener Chat nötig, kein Offline-Problem

Warum noch nicht im Prototyp:

- Nur 3 User beim MODEM 2026 → kein Cross-Crew-Matching möglich
- Braucht mehrere Crews mit je mehreren Bewertungen (mind. 10 Artists bewertet)
- Erst nach MODEM wenn mehr User auf der Plattform sind

13. Sprint-Plan
    Sprint
    Was
    Status
    1–3
    Grundsystem, Auth, Artist-Liste, Rating, Crew, PWA, Admin
    ✅ Fertig
    4
    Design System + Tile-Layout-Überarbeitung
    ✅ Fertig (v0.8)
    5
    Offline-Auth (Passphrase) + 80s-Quotes + persistenter Crew-Code + Crew-Name + Microsoft Login
    ✅ Fertig (v0.10)
    6a
    Crew-Fixes (Tiles, Kommentare, Auto-Refresh) + Crew-Code sichtbar + klickbare Crew-Kachel
    ✅ Fertig (v0.10)
    6b
    Mehrere Festivals + Festival-Switcher + Vorlagen + Dynamische Stage-Filter
    ✅ Fertig (v0.11)
    6c
    Crew-Modell Migration: crews/{id}, ein Code, Crew erstellen/beitreten/verlassen
    ✅ Fertig (v0.12)
    6d
    Fixes: Nav-Responsive, Logo-Link, Crew-Scroll, MOYN-Import, Festival-Switcher-Bug
    ✅ Fertig (v0.13)
    7
    Timetable Admin-Flow (Foto → OCR → Firebase)
    🔲 Juli 2026
    8
    MODEM-Test, Feedback sammeln
    🔲 August 2026
    9
    v1 Planung basierend auf Feedback
    🔲 September 2026

14. Offene Fragen
    Frage
    Status
    Welcher type_key für Artist/Rating in Anytype?
    Nicht relevant (Firebase)
    Sollen alle eingeloggten User Ratings sehen?
    ✅ Ja — Single-Modus: alle, Crew-Modus: nur Crew
    Timetable-Kollaboration zwischen Usern?
    ✅ Nein — nur Admin, Prototyp
    Design für Festival-Buch PDF?
    Offen — nach MODEM entscheiden
    App-Icon final?
    ✅ v0.8 — Schallwelle + "HD" (H weiß, D lila), 192px + 512px PNG
