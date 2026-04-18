HEARD — Product Requirements Document
Version: 0.5 Stand: April 2026 Autor: Daniel Classen Status: Prototyp live (v0.8) — Sprint 5 startet

Dieses Dokument ist das zentrale Pflichtenheft für HEARD. Es wird bei jeder Session in VS Code als Kontext mitgegeben, damit Claude den aktuellen Stand kennt und korrekte Entscheidungen trifft.

1. Vision & Ziel
   Ein Festival-Companion der dir hilft, das Line-Up eines Festivals vorab zu hören, zu bewerten und daraus deinen persönlichen Timetable zu bauen — gemeinsam mit deinen Festivalbegleiter\*innen.

Kern-Versprechen: Nie wieder Artists verpassen weil du nicht weisst wer gut ist.

2. Kontext & Ausgangslage
   Bisher: Line-Up manuell durchgehört, Excel-Tabelle gepflegt, ausgedruckt, fotografiert, als Foto auf dem Handy mitgenommen. Kein Vergleich mit Festivalbegleiter\*innen möglich.

Prototyp: MODEM Festival 2026 (Kroatien, Juli 2026) Drei Stages: The Hive, The Swamp, The Seed Line-Up 2026 bereits online unter:

https://modemfestival.com/the-hive/
https://modemfestival.com/the-swamp/
https://modemfestival.com/the-seed/

Artists + SoundCloud-Links sind bereits via Scraper in Firebase importiert. Timetable (Zeiten) kommt erst wenige Tage vor dem Festival im Juli 2026.

3. Zielgruppe
   Prototyp: Daniel + 2 Festivalbegleiterinnen (3 Nutzerinnen)
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

7.5 crew_invites/{code}
Feld
Typ
Beschreibung
id
string
Der 6-stellige Code selbst
creator_uid
string
Firebase Auth UID des Einladenden
created_at
timestamp
Auto
used
boolean
true sobald eingelöst

7.6 crew_connections/{connId}
Feld
Typ
Beschreibung
id
string
Auto (Firebase)
members
array
Zwei Firebase Auth UIDs
created_at
timestamp
Auto

Hinweis: Migration zu crews/{crewId} mit Team-Name geplant für v1, nicht Prototyp.

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

    match /crew_invites/{code} {

      allow read: if request.auth != null;

      allow create: if request.auth != null &&

        request.resource.data.creator_uid == request.auth.uid;

      allow update: if request.auth != null;

    }

    match /crew_connections/{connId} {

      allow read: if request.auth != null &&

        request.auth.uid in resource.data.members;

      allow create: if request.auth != null &&

        request.auth.uid in request.resource.data.members;

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
🔲 Sprint 5 — Offline-Auth (KRITISCH für Festival) (JETZT)
Passphrase-System (offline-auth.js):

Beim ersten Login (mit Internet):

User richtet Passphrase ein — App generiert einen Vorschlag:
"Daniel will GRUB auf dem Swamp unbedingt sehen" (aus Favoriten)
"Daniel findet BUG zu beliebig" (aus schlechten Ratings + Kommentar)
Oder: User gibt eigene Passphrase ein
User bestätigt Passphrase (zweimal eingeben)
App berechnet SHA-256(passphrase) → speichert Hash in localStorage UND Firebase (users/{uid}/offline_auth_hash)
Passphrase selbst wird NIEMALS gespeichert

Auf dem Festival (ohne Internet):

App erkennt: kein Internet → zeigt Offline-Login-Screen
User gibt Passphrase ein
App berechnet SHA-256(passphrase) → vergleicht mit lokalem Hash
Bei Match: User ist eingeloggt (lokale Session), alle gecachten Daten verfügbar

UX-Hinweis beim Setup: "Diese Passphrase brauchst du auf dem Festival. Schreib sie auf oder schick sie dir selbst per WhatsApp."
🔲 Sprint 6 — Mehrere Festivals + "Gesehen"-Checkbox
Festival-Switcher:

active_festival_id im User-Profil
Profil-Menü zeigt alle Festivals des Users
Festival wechseln → alle Ansichten aktualisieren sich

Vorgefertigte Festivals (Templates):

festival_templates Collection in Firebase
Bekannte Festivals vorausgefüllt: MODEM, Nation of Gondwana, Ozora, Fusion, ...
Beim Anlegen: aus Liste auswählen oder manuell eingeben

"Gesehen"-Checkbox:

Neues Feld seen: boolean im Rating
Auf dem Festival antippbar: "Ich hab ihn gesehen!"
Basis für späteres Festival-Buch
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
    Prototyp: crew_connections (1:1). v1: crews/{id} mit Team-Name + wiederverwendbarem Code
    Timetable
    Admin-only, kein kollaboratives Editing
    Mehrere Festivals
    active_festival_id im User-Profil, Festival-Templates in Firebase
    Monetarisierung
    PayPal.me im Footer für Spenden, Stripe erst nach MODEM wenn nötig
    Frameworks
    Keine — reines HTML/CSS/JS

11. Bekannte Bugs
    Weißes Rechteck auf Desktop (ungelöst)
    Ein unsichtbares Element blockiert Mouse-Events auf der Hauptseite (Desktop). Wahrscheinlich ein Firebase Auth Popup-Overlay oder panel-backdrop mit falschem z-index. Diagnose: document.elementFromPoint(x, y) in DevTools-Konsole ausführen.
    Bereits gelöste Bugs
    Service Worker Cache-Invalidierung (automatisches Update alle 60s)
    img src="" Bug im Profil-Panel (jetzt vollständig dynamisch gerendert)
    APP_VERSION / SW-Version Mismatch (beide jetzt v0.7)

12. Backlog (nach MODEM)
    Feature
    Aufwand
    Prio
    Crew-Match zwischen fremden Crews (Ähnlichkeits-Score)
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
    Offline-Auth (Passphrase)
    🔲 Jetzt
    6
    Mehrere Festivals + "Gesehen"-Checkbox
    🔲 Mai 2026
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
