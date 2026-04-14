# HEARD (Festival Buddy) — Product Requirements Document

**Version:** 0.1 (Prototyp MODEM 2026)
**Stand:** April 2026
**Autor:** Daniel Classen
**Status:** Konzeptphase

> **PRD** steht für **Product Requirements Document** — das Pflichtenheft vor dem ersten Code.
> Es beschreibt was gebaut wird, warum, für wen und wie — damit beim Entwickeln keine
> grundlegenden Fragen mehr offen sind.

---

## 1. Vision & Ziel

Ein Festival-Companion der dir hilft, das Line-Up eines Festivals vorab zu hören, zu bewerten
und daraus deinen persönlichen Timetable zu bauen — gemeinsam mit deinen Festivalbegleiter\*innen.

**Kern-Versprechen:** Nie wieder Artists verpassen weil du nicht weisst wer gut ist.

---

## 2. Kontext & Ausgangslage

Bisher: Line-Up manuell durchgehört, Excel-Tabelle mit Rating und Kommentar gepflegt,
ausgedruckt, fotografiert und als Foto auf dem Handy mitgenommen. Keine Möglichkeit den
persönlichen Timetable mit Festivalbegleiter\*innen zu vergleichen.

**Prototyp:** MODEM Festival 2026 (Kroatien, Juli 2026)
Drei Stages: The Hive, The Swamp, The Seed
Line-Up bereits online mit SoundCloud-Links pro Artist.
Timetable (Zeiten) kommt erst wenige Tage vor dem Festival.

---

## 3. Zielgruppe

- **Prototyp:** Daniel + 2 Festivalbegleiter*innen (3 Nutzer*innen)
- **v1 (später):** Beliebig viele Nutzer\*innen, mehrere Festivals
- **Technisches Niveau:** Normale Smartphone-Nutzung, kein technisches Wissen erforderlich

---

## 4. Die zwei Phasen der Nutzung

### Phase 1 — Vor dem Festival (mit Internet)

Alle Nutzer*innen laden die App, hören Artists via SoundCloud vor, vergeben Ratings und
Kommentare. Daten werden in Firebase synchronisiert. Alle sehen die Bewertungen der anderen.
Wenn der Timetable veröffentlicht wird: Zeiten und Stages werden ergänzt (manuell oder per
Scraper). Jede*r erstellt seinen persönlichen Timetable aus den Favoriten.

### Phase 2 — Auf dem Festival (kein Internet)

Die App wurde als PWA installiert. Ein Service Worker hat beim letzten Online-Besuch alle
Daten lokal gecacht. Auf dem Festival läuft die App vollständig offline — Timetable anzeigen,
Bewertungen lesen, eigene Favoriten prüfen. Änderungen werden lokal gespeichert und beim
nächsten Internet-Kontakt synchronisiert.

---

## 5. Datenmodell

### 5.1 Artist

| Feld                | Typ       | Pflicht | Beschreibung                                    |
| ------------------- | --------- | ------- | ----------------------------------------------- |
| `id`                | string    | ja      | Auto (Firebase)                                 |
| `name`              | string    | ja      | Artistname, z.B. "GRUB"                         |
| `stage`             | string    | ja      | "hive", "swamp", "seed"                         |
| `soundcloud_url`    | string    | nein    | Direkt von MODEM-Website gescrapt               |
| `modem_profile_url` | string    | nein    | Link zum Artist-Profil auf MODEM-Website        |
| `day`               | string    | nein    | "monday", "tuesday", etc. — kommt mit Timetable |
| `time_start`        | number    | nein    | Startzeit in Dezimalstunden (z.B. 23.0 = 23:00) |
| `time_end`          | number    | nein    | Endzeit (z.B. 1.0 = 01:00 nächste Nacht)        |
| `festival_id`       | string    | ja      | Referenz auf das Festival                       |
| `created_at`        | timestamp | ja      | Auto                                            |

### 5.2 Rating (pro User & Artist)

| Feld          | Typ       | Pflicht | Beschreibung                         |
| ------------- | --------- | ------- | ------------------------------------ |
| `id`          | string    | ja      | Auto (Firebase)                      |
| `artist_id`   | string    | ja      | Referenz auf Artist                  |
| `user_id`     | string    | ja      | Firebase Auth UID                    |
| `rating`      | number    | nein    | 1–5 Sterne (0 = noch nicht bewertet) |
| `comment`     | string    | nein    | Freitext-Kommentar                   |
| `listened`    | boolean   | ja      | "Reingehört?" true/false             |
| `want_to_see` | boolean   | nein    | Im Timetable merken                  |
| `updated_at`  | timestamp | ja      | Auto                                 |

### 5.3 Festival

| Feld          | Typ    | Pflicht | Beschreibung                 |
| ------------- | ------ | ------- | ---------------------------- |
| `id`          | string | ja      | Auto (Firebase)              |
| `name`        | string | ja      | z.B. "MODEM 2026"            |
| `location`    | string | nein    | z.B. "Kroatien"              |
| `date_start`  | date   | nein    | Startdatum                   |
| `date_end`    | date   | nein    | Enddatum                     |
| `stages`      | array  | ja      | Liste der Stage-Namen        |
| `lineup_urls` | object | nein    | Stage → Scraper-URL          |
| `created_by`  | string | ja      | Firebase Auth UID des Admins |

### 5.4 User

| Feld           | Typ    | Pflicht | Beschreibung          |
| -------------- | ------ | ------- | --------------------- |
| `uid`          | string | ja      | Firebase Auth UID     |
| `display_name` | string | ja      | Anzeigename           |
| `email`        | string | ja      | Google-Account E-Mail |
| `photo_url`    | string | nein    | Google-Profilbild     |
| `role`         | string | ja      | "admin" oder "viewer" |

---

## 6. Features

### 6.1 Priorität 1 — Prototyp-Kern

**Authentifizierung**

- Login with Google (Firebase Auth)
- Kein manuelles Registrieren, kein Passwort
- Beim ersten Login wird automatisch ein User-Profil angelegt

**Artist-Liste**

- Alle Artists des Festivals alphabetisch sortiert
- Filterbar nach Stage (The Hive / The Swamp / The Seed)
- Filterbar nach "Noch nicht bewertet" / "Bewertet" / "Favoriten"
- Suchfeld (Live-Suche nach Artistname)
- Pro Artist: Name, Stage-Badge, SoundCloud-Button (öffnet SoundCloud extern), eigenes Rating als Sterne

**Rating vergeben**

- Antipp auf Artist → Detail-Ansicht
- 1–5 Sterne wählbar
- Checkbox "Reingehört"
- Freitext-Kommentar
- Speichern landet sofort in Firebase und ist für alle sichtbar

**Crew-Vergleich**

- Ansicht "Crew" zeigt alle Nutzer\*innen die eingeloggt sind
- Pro Artist: wer hat wie viele Sterne gegeben (kleine Avatar-Icons mit Sternen)
- Gemeinsame Favoriten werden hervorgehoben ("Alle 3 wollen das sehen!")

**Persönlicher Timetable**

- Zeigt nur Artists mit "Favorit" oder Rating ≥ 4 Sterne
- Gruppiert nach Tag und Uhrzeit
- Zeitkonflikte werden markiert (zwei Favoriten zur gleichen Zeit an verschiedenen Stages)
- Wenn noch kein Timetable verfügbar: nur Favoritenliste ohne Zeiten

### 6.2 Priorität 2 — Offline & PWA

**PWA Installation**

- Manifest + Service Worker
- Installierbar auf iOS (Safari) und Android (Chrome)
- App-Icon, Splash Screen

**Offline-Caching**

- Service Worker cached beim letzten Online-Besuch:
  - Alle Artists des Festivals
  - Alle Ratings aller Nutzer\*innen
  - Den persönlichen Timetable
- Offline-Änderungen (neue Ratings) werden in localStorage gepuffert
- Bei nächstem Internet-Kontakt automatisch zu Firebase synchronisiert

### 6.3 Priorität 3 — Scraper & Admin

**Scraper (einmalig)**

- Script das die drei MODEM-Seiten abruft und Artists + SoundCloud-Links extrahiert
- Ergebnis wird als JSON in Firebase importiert
- Läuft als Node.js Script auf dem Laptop, nicht in der App selbst

**Admin-Bereich**

- Nur für User mit Rolle "admin"
- Festival anlegen / bearbeiten
- Artists manuell hinzufügen / bearbeiten
- Timetable-Daten (Zeiten) eintragen wenn verfügbar
- Nutzer\*innen verwalten (Rollen zuweisen)

### 6.4 Priorität 4 — Nice to Have (v1)

- Mehrere Festivals anlegen (Grundlage für Erweiterung über MODEM hinaus)
- Push-Benachrichtigung wenn Artist bald spielt ("GRUB spielt in 30 Minuten!")
- Export des Timetables als PDF oder Bild zum Teilen
- Apple Login / Microsoft Login nachrüsten

---

## 7. Technische Architektur

```
Frontend:         GitHub Pages (PWA — HTML/CSS/JS)
Datenbank:        Firebase Firestore (Spark Plan, kostenlos)
Authentication:   Firebase Auth (Google Login)
Offline:          Service Worker + localStorage Cache
Scraper:          Node.js Script (lokal, einmalig ausführen)
Hosting:          github.com/3dclassen/festival-buddy
Live:             https://3dclassen.github.io/festival-buddy/
```

**Warum kein Backend?**
Firebase ermöglicht direkte Datenbankzugriffe aus dem Frontend — kein eigener Server nötig.
Daten sind durch Firebase Security Rules geschützt.

---

## 8. Firebase Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Festivals: jeder kann lesen, nur Admins schreiben
    match /festivals/{festivalId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Artists: jeder eingeloggte User kann lesen, nur Admins schreiben
    match /artists/{artistId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Ratings: jeder kann lesen, jeder kann eigene Ratings schreiben
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

---

## 9. Offline-Strategie im Detail

**Beim letzten Online-Besuch (automatisch):**

1. Service Worker cached alle App-Dateien (HTML, CSS, JS)
2. App lädt alle Artists des aktiven Festivals und speichert in localStorage
3. App lädt alle Ratings und speichert in localStorage
4. Timestamp "zuletzt synchronisiert" wird gespeichert

**Auf dem Festival ohne Internet:**

- App startet aus dem Cache — kein Laden nötig
- Alle Daten kommen aus localStorage
- Neue Ratings werden in einer "pending sync" Queue in localStorage gespeichert

**Wenn wieder Internet vorhanden:**

- App erkennt Verbindung (navigator.onLine Event)
- Pending-Queue wird automatisch zu Firebase synchronisiert
- Lokale Daten werden mit Firebase-Stand abgeglichen

---

## 10. Projektstruktur (GitHub Repository)

```
festival-buddy/
├── index.html          ← Haupt-App (Artist-Liste, Filter, Rating)
├── timetable.html      ← Persönlicher Timetable
├── crew.html           ← Crew-Vergleich
├── admin.html          ← Admin-Bereich (geschützt)
├── css/
│   └── style.css       ← Dunkles Theme passend zum Festival-Vibe
├── js/
│   ├── app.js          ← Hauptlogik, Routing, State
│   ├── firebase.js     ← Firebase SDK, Auth, Firestore-Funktionen
│   ├── rating.js       ← Rating-Logik, Kommentare
│   ├── timetable.js    ← Timetable-Generierung, Konflikt-Erkennung
│   ├── sync.js         ← Offline-Sync, localStorage Cache
│   └── admin.js        ← Admin-Funktionen
├── scraper/
│   ├── scrape-modem.js ← Node.js Script: MODEM-Seiten → Firebase
│   └── package.json
├── sw.js               ← Service Worker (Offline-Caching)
├── manifest.json       ← PWA Manifest
├── icon-192.png
├── icon-512.png
└── README.md
```

---

## 11. Was NICHT in den Prototyp kommt

- Mehrere Festivals gleichzeitig (kommt in v1)
- Apple/Microsoft Login (kann nachgerüstet werden)
- Push-Benachrichtigungen
- Export als PDF
- Eigene Artist-Fotos/Bilder
- Kommentar-System zwischen Nutzer\*innen (Diskussion)

---

## 12. MODEM 2026 — was wir bereits wissen

**Scraper-Quellen (2026 Line-Up bereits online):**

- The Hive: `https://modemfestival.com/the-hive/`
- The Swamp: `https://modemfestival.com/the-swamp/`
- The Seed: `https://modemfestival.com/the-seed/`

**Was die Seiten liefern (bereits verifiziert):**

- Artist-Name als Link-Text
- SoundCloud-URL direkt als href — **kein separater Scraping-Schritt nötig**
- Alphabetisch sortiert

**Was noch fehlt:**

- Timetable (Zeiten pro Artist) — kommt wenige Tage vor dem Festival im Juli
- Stage-Infos (auf welcher Stage spielt wer — ist aber auf den Stage-Seiten bereits implizit)

**Beispiel aus The Hive (2026):**

- GRUB, VORPAL, AMORTALIST, SYNTHETIK CHAOS, SENSE DATUM, ... (ca. 80+ Artists über alle 3 Stages)

---

## 13. Nächste Schritte

| Schritt | Was                                                   | Wer             | Wann      |
| ------- | ----------------------------------------------------- | --------------- | --------- |
| 1       | Firebase Projekt anlegen                              | Daniel          | Vor Start |
| 2       | GitHub Repo `festival-buddy` anlegen                  | Daniel          | Vor Start |
| 3       | Scraper schreiben und alle Artists importieren        | Claude + Daniel | Sprint 1  |
| 4       | Firebase Auth + Google Login implementieren           | Claude          | Sprint 1  |
| 5       | Artist-Liste mit Filter und SoundCloud-Button         | Claude          | Sprint 1  |
| 6       | Rating-System implementieren                          | Claude          | Sprint 2  |
| 7       | Crew-Vergleich                                        | Claude          | Sprint 2  |
| 8       | Timetable-Ansicht                                     | Claude          | Sprint 2  |
| 9       | PWA + Service Worker + Offline                        | Claude          | Sprint 3  |
| 10      | Admin-Bereich                                         | Claude          | Sprint 3  |
| 11      | Timetable-Daten eintragen (wenn MODEM veröffentlicht) | Daniel          | Juli 2026 |

---

## 14. Offene Fragen

| Frage                                                                              | Status                              |
| ---------------------------------------------------------------------------------- | ----------------------------------- |
| Wie soll die Crew-Vergleichsansicht aussehen?                                      | Offen — beim Entwickeln entscheiden |
| Sollen Artists bewertet werden können ohne eingeloggt zu sein?                     | Nein — Login ist Pflicht            |
| Was passiert wenn zwei Artists zur gleichen Zeit spielen und beide Favoriten sind? | Konflikt-Badge in Timetable         |
| Sollen andere MODEM-Besucher (außerhalb der Crew) die Ratings sehen können?        | Prototyp: Nein. v1: optional        |
