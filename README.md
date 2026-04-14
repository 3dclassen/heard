# HEARD — Festival Buddy

Festival-Companion-App für MODEM 2026. Artists vorab hören, bewerten, mit der Crew vergleichen und den persönlichen Timetable bauen — auch offline.

**Live:** https://3dclassen.github.io/heard/
**Firebase:** heard-lineup (Firestore + Auth)

---

## Architektur

```
Frontend:        GitHub Pages — Vanilla HTML / CSS / ES-Module JS
Datenbank:       Firebase Firestore (Spark Plan, kostenlos)
Auth:            Firebase Auth (Google Login)
Offline:         Service Worker + localStorage Cache + Firestore IndexedDB-Persistenz
Scraper:         Node.js Script (lokal ausführen, einmalig)
```

Kein Build-Tool, kein Framework, kein Backend. Firebase ermöglicht direkte Frontend-Zugriffe — Sicherheit via Security Rules.

---

## Projektstruktur

```
heard/
├── index.html          Haupt-App: Artist-Liste, Filter, Rating-Panel
├── timetable.html      Persönlicher Timetable (nach Favoriten + Zeiten)
├── crew.html           Crew-Vergleich: wer bewertet was wie
├── admin.html          Admin-Bereich (nur für role="admin")
├── css/
│   └── style.css       Dunkles Festival-Theme
├── js/
│   ├── firebase.js     Firebase init, Auth, Firestore-Funktionen (exports)
│   ├── app.js          Hauptlogik index.html: Auth, Artist-Liste, Panel
│   ├── rating.js       Reine Berechnungsfunktionen (keine UI)
│   ├── timetable.js    Timetable-UI und Konflikt-Erkennung
│   ├── sync.js         localStorage Cache, Offline-Queue, Sync-Orchestrierung
│   └── admin.js        Admin-UI und Firestore-Schreiboperationen
├── scraper/
│   ├── scrape-modem.js Node.js Scraper: MODEM-Seiten → Firebase
│   ├── package.json
│   └── .gitignore      (service-account.json und node_modules ausgeschlossen)
├── icons/
│   ├── icon-192.png    PWA App-Icon (muss manuell erstellt werden)
│   └── icon-512.png    PWA App-Icon (muss manuell erstellt werden)
├── sw.js               Service Worker (Offline-Caching)
├── manifest.json       PWA Manifest
└── README.md
```

---

## Setup für neue Entwickler

### Voraussetzungen

- Node.js 18+ (nur für den Scraper)
- Git
- GitHub-Account mit Zugriff auf `3dclassen/heard`
- Firebase-Zugriff auf Projekt `heard-lineup` (von Daniel einladen lassen)

### 1. Repo klonen

```bash
git clone https://github.com/3dclassen/heard.git
cd heard
```

### 2. Lokal testen

Da die App ES-Module im Browser verwendet, kann sie **nicht** direkt per `file://` geöffnet werden — du brauchst einen lokalen HTTP-Server:

```bash
# Option A: npx (kein Install nötig)
npx serve .

# Option B: VS Code Extension "Live Server" (Port 5500)
# Option C: Python
python -m http.server 8080
```

Dann im Browser: `http://localhost:8080`

### 3. GitHub Pages

GitHub Pages ist unter **Settings → Pages → Branch: main → Folder: / (root)** aktiviert.

Jeder Push auf `main` deployt automatisch. Nach dem Push ca. 1–2 Minuten warten.

---

## Firebase-Konfiguration

### Security Rules (Firestore)

In der Firebase Console unter **Firestore → Rules** folgende Rules eintragen:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Festivals: eingeloggte User lesen, nur Admins schreiben
    match /festivals/{festivalId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Artists: eingeloggte User lesen, nur Admins schreiben
    match /artists/{artistId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Ratings: alle lesen, jeder kann eigene schreiben
    match /ratings/{ratingId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        request.resource.data.user_id == request.auth.uid;
    }

    // Users: eigenes Profil lesen/schreiben, Admin liest alle
    match /users/{userId} {
      allow read: if request.auth != null &&
        (request.auth.uid == userId ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Authorized Domains (Firebase Auth)

Firebase Console → Authentication → Settings → Authorized domains:
- `localhost` (für lokale Entwicklung, ist standardmäßig drin)
- `3dclassen.github.io` (für GitHub Pages — **muss manuell hinzugefügt werden**)

### Ersten Admin setzen

Beim ersten Login wird automatisch ein User-Dokument mit `role: "viewer"` angelegt.
Um einen Admin zu setzen, direkt in der Firestore Console:

1. Collection `users` → das eigene Dokument (UID) öffnen
2. Feld `role` auf `"admin"` setzen

Danach erscheint der Admin-Link in der Navigation.

---

## Datenmodell

### Collection: `festivals`

| Feld         | Typ    | Beschreibung                         |
|--------------|--------|--------------------------------------|
| `id`         | string | `modem-2026` (fest, kein Auto-ID)    |
| `name`       | string | `MODEM 2026`                         |
| `location`   | string | `Kroatien`                           |
| `stages`     | array  | `["hive", "swamp", "seed"]`          |
| `created_by` | string | Firebase Auth UID des Admins         |

### Collection: `artists`

| Feld              | Typ       | Beschreibung                              |
|-------------------|-----------|-------------------------------------------|
| `name`            | string    | Artistname, z.B. `GRUB`                  |
| `stage`           | string    | `"hive"` / `"swamp"` / `"seed"`          |
| `soundcloud_url`  | string    | Direkt von MODEM-Website                  |
| `festival_id`     | string    | `modem-2026`                              |
| `day`             | string    | `"wednesday"` etc. — kommt mit Timetable |
| `time_start`      | number    | Dezimalstunden, z.B. `23.5` = 23:30      |
| `time_end`        | number    | Dezimalstunden, z.B. `1.0` = 01:00       |
| `created_at`      | timestamp | Auto                                      |

### Collection: `ratings`

Dokument-ID: `{userId}_{artistId}` (deterministisch — kein Duplikat-Problem)

| Feld          | Typ       | Beschreibung                    |
|---------------|-----------|---------------------------------|
| `user_id`     | string    | Firebase Auth UID               |
| `artist_id`   | string    | Referenz auf artists-Dokument   |
| `festival_id` | string    | `modem-2026`                    |
| `rating`      | number    | 0–5 (0 = noch nicht bewertet)   |
| `comment`     | string    | Freitext                        |
| `listened`    | boolean   | Reingehört?                     |
| `want_to_see` | boolean   | Favorit / will ich sehen        |
| `updated_at`  | timestamp | Auto                            |

### Collection: `users`

| Feld           | Typ    | Beschreibung                          |
|----------------|--------|---------------------------------------|
| `uid`          | string | Firebase Auth UID (= Dokument-ID)     |
| `display_name` | string | Google-Anzeigename                    |
| `email`        | string | Google-E-Mail                         |
| `photo_url`    | string | Google-Profilbild URL                 |
| `role`         | string | `"viewer"` oder `"admin"`             |

---

## Scraper ausführen

Der Scraper lädt Artists + SoundCloud-Links von den MODEM-Stage-Seiten und importiert sie in Firebase.

### Setup

```bash
cd scraper
npm install
```

### Firebase Admin Key

1. Firebase Console → Projekteinstellungen → Dienstkonten
2. "Neuen privaten Schlüssel generieren" → JSON herunterladen
3. Datei als `scraper/service-account.json` speichern

> **Wichtig:** `service-account.json` ist in `.gitignore` — niemals committen!

### Ausführen

```bash
# Erst trocken laufen lassen (kein Import — nur artists.json erzeugen)
npm run scrape:dry

# Ergebnis in scraper/artists.json prüfen, dann live importieren
npm run scrape
```

### Manueller Import via Admin-UI

Alternativ: `artists.json` öffnen, Inhalt kopieren, im Admin-Bereich der App unter "JSON importieren" einfügen.

---

## PWA-Icons erstellen

Die App braucht zwei Icons:
- `icons/icon-192.png` — 192×192 px
- `icons/icon-512.png` — 512×512 px

Einfachste Methode: [favicon.io](https://favicon.io/favicon-generator/) — Text "H", Hintergrundfarbe `#7c3aed`, Textfarbe `#ffffff`.

---

## Offline-Verhalten

1. **Service Worker** cached alle App-Dateien beim ersten Besuch
2. **Firestore IndexedDB-Persistenz** cached Datenbankdaten automatisch
3. **localStorage Cache** in `sync.js` speichert Artists/Ratings/Users als Backup
4. **Offline-Rating**: Neue Bewertungen landen in einer `heard_pending_ratings`-Queue in localStorage
5. **Sync**: Beim nächsten Online-Kontakt werden pending Ratings automatisch zu Firebase hochgeladen

---

## Deployment

```bash
git add -A
git commit -m "Beschreibung der Änderung"
git push origin main
```

Live nach 1–2 Minuten unter https://3dclassen.github.io/heard/

---

## Festival-Daten ergänzen (Timetable)

Sobald MODEM den Timetable veröffentlicht (ca. Juli 2026):

1. Admin-Bereich öffnen → Artist-Tabelle
2. Pro Artist auf "Bearbeiten" klicken
3. Tag (`wednesday`/`thursday`/etc.) und Zeiten als Dezimalstunden eintragen
   - `23.0` = 23:00, `23.5` = 23:30, `1.0` = 01:00 (nächste Nacht)
4. Speichern → Timetable-Ansicht aktualisiert sich sofort

---

## Entwickler-Kontakt

Daniel Classen — [github.com/3dclassen](https://github.com/3dclassen)
