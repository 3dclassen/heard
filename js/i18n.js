// ── HEARD — Internationalisierung (DE / EN) ──

const TRANSLATIONS = {
  de: {
    // Navigation
    'nav.artists':   'Artists',
    'nav.timetable': 'Timetable',
    'nav.crew':      'Crew',
    'nav.help':      'Hilfe',
    'nav.admin':     'Admin',

    // Login
    'login.tagline':   'Hör rein, bewerte, plane deinen persönlichen Festival-Timetable.',
    'login.google':    'Mit Google anmelden',
    'login.microsoft': 'Mit Microsoft anmelden',

    // Offline-Login
    'offline.greeting':   'Du bist offline.',
    'offline.hint':       'Gib deine Festival-Passphrase ein um fortzufahren.',
    'offline.placeholder':'Festival-Passphrase...',
    'offline.btn':        'Offline einloggen',
    'offline.error':      'Falsche Passphrase. Nochmal?',
    'offline.forgot':     'Vergessen? Kurz ins WLAN → Google-Login → Profil → neue Passphrase setzen.',

    // Offline-Banner
    'offline.banner': 'Offline — Änderungen werden gespeichert und beim nächsten Mal synchronisiert',

    // Filter
    'filter.search':      'Artist suchen...',
    'filter.all_stages':  'Alle Stages',
    'filter.all':         'Alle',
    'filter.unrated':     'Noch nicht bewertet',
    'filter.rated':       'Bewertet',
    'filter.favorites':   'Favoriten ♥',
    'filter.listened':    'Reingehört',
    'filter.crew_commented': 'Crew-Kommentare 💬',

    // Sort
    'sort.name_asc':    'A → Z',
    'sort.name_desc':   'Z → A',
    'sort.rating_desc': 'Höchste Bewertung zuerst',
    'sort.rating_asc':  'Niedrigste Bewertung zuerst',

    // Rating-Panel
    'panel.my_rating':       'Meine Bewertung',
    'panel.before_festival': 'Vor dem Festival',
    'panel.on_festival':     'Auf dem Festival',
    'panel.listened':        'Reingehört',
    'panel.favorite':        'Favorit — will ich sehen ♥',
    'panel.seen':            'Gesehen ✓',
    'panel.comment':         'Kommentar',
    'panel.save':            'Speichern',
    'panel.saving':          'Speichern...',
    'panel.saved':           'Gespeichert ✓',
    'panel.crew':            'Crew',
    'panel.no_crew_ratings': 'Noch keine Crew-Bewertungen',
    'panel.no_soundcloud':   'Kein SoundCloud-Link vorhanden',
    'panel.soundcloud':      'Auf SoundCloud anhören',

    // Toasts / Meldungen
    'toast.login_error':    'Login fehlgeschlagen',
    'toast.ms_login_error': 'Microsoft-Login fehlgeschlagen',
    'toast.lineup_updated': 'Lineup aktualisiert ✓',
    'toast.offline_saved':  'Offline gespeichert — wird synchronisiert wenn du wieder online bist',
    'toast.save_error':     'Fehler beim Speichern',
    'toast.passphrase_saved': "Passphrase gespeichert. I'll be back — auch offline.",
    'toast.min_length':     'Bitte mindestens 6 Zeichen eingeben',
    'toast.festival_switched': 'Festival gewechselt:',
    'toast.synced':         'Bewertung(en) synchronisiert',

    // SW-Update-Toast
    'sw.updating':       'Aktualisiere App…',
    'sw.update_waiting': 'Update verfügbar — wird nach dem Speichern geladen',

    // Leere Zustände
    'empty.no_artists_admin':  'Noch keine Artists geladen. Ein Admin muss zuerst den Scraper ausführen.',
    'empty.no_artists_filter': 'Keine Artists für diesen Filter.',

    // Passphrase-Setup
    'passphrase.title':           'Festival-Passphrase einrichten',
    'passphrase.hint':            "Auf dem Festival gibt's kein Internet. Mit dieser Passphrase kannst du dich trotzdem einloggen.",
    'passphrase.write_down':      'Schreib sie auf — oder schick sie dir per WhatsApp.',
    'passphrase.suggestion_label':'Vorschlag (tippen zum Übernehmen):',
    'passphrase.divider':         '— oder eigene Passphrase eingeben —',
    'passphrase.input_1':         'Passphrase eingeben...',
    'passphrase.input_2':         'Passphrase bestätigen...',
    'passphrase.mismatch':        'Die Passphrases stimmen nicht überein.',
    'passphrase.save':            'Passphrase speichern',
    'passphrase.saving':          'Wird gespeichert...',
    'passphrase.skip':            'Später einrichten',

    // Profil-Modal
    'profile.switch':             'Wechseln',
    'profile.passphrase_ok':      '✓ Offline-Passphrase eingerichtet',
    'profile.passphrase_missing': '⚠ Noch keine Offline-Passphrase',
    'profile.passphrase_change':  'Ändern',
    'profile.passphrase_setup':   'Einrichten',
    'profile.logout':             'Ausloggen',

    // Festival-Switcher
    'festival.switch_title':     'Festival wechseln',
    'festival.create_btn':       '+ Neues Festival anlegen',
    'festival.new_title':        'Neues Festival',
    'festival.template':         'Vorlage',
    'festival.name_label':       'Name',
    'festival.location_label':   'Ort / Land',
    'festival.year_label':       'Jahr',
    'festival.create':           'Festival anlegen',
    'festival.creating':         'Wird angelegt...',
    'festival.name_required':    'Bitte einen Festival-Namen eingeben.',
    'festival.error':            'Fehler: ',
    'festival.name_placeholder': 'Festival-Name...',
    'festival.loc_placeholder':  'z.B. Kroatien',

    // Timetable
    'timetable.title':       'Mein Timetable',
    'timetable.loading':     'Lade...',
    'timetable.no_favorites':'Noch keine Favoriten — geh zurück zur Artist-Liste und bewerte ein paar Acts!',
    'timetable.no_times':    'Timetable (Zeiten) noch nicht verfügbar. Hier sind deine Favoriten:',
    'timetable.no_day':      'Keine Favoriten an diesem Tag.',
    'timetable.conflict':    'Zeitkonflikt ⚡',
    'timetable.min_rating':  'Auch aufnehmen ab:',
    'timetable.only_hearts': 'Nur ♥',
    'timetable.view_label':  'Ansicht:',
    'timetable.view_mine':   'Nur ich',
    'timetable.view_crew':   '+ Crew',
    'timetable.you':         'Du',

    // Crew-Seite
    'crew.no_crew':          'Du bist noch in keiner Crew für dieses Festival.',
    'crew.create_title':     'Neue Crew erstellen',
    'crew.create_hint':      'Gib deiner Crew einen Namen und teile den generierten Code:',
    'crew.create_placeholder':'z.B. Die Hive-Fraktion',
    'crew.create_btn':       'Crew erstellen',
    'crew.creating':         'Erstelle...',
    'crew.or':               'oder',
    'crew.join_title':       'Crew beitreten',
    'crew.join_hint':        'Gib den Code ein den du von jemandem erhalten hast:',
    'crew.join_btn':         'Beitreten',
    'crew.joining':          'Verbinde...',
    'crew.invite_title':     'Crew erweitern',
    'crew.invite_hint':      'Teile diesen Code mit Freunden — er bleibt immer gleich:',
    'crew.copy':             'Kopieren',
    'crew.copied':           'Kopiert ✓',
    'crew.leave':            'Crew verlassen',
    'crew.leaving':          'Verlasse...',
    'crew.shared_title':     'Alle wollen sehen 🔥',
    'crew.match_title':      'Andere Crews beim Festival',
    'crew.ratings_title':    'Crew-Bewertungen',
    'crew.no_other_crews':   'Noch keine anderen Crews beim Festival — kommt bald! 🎪',
    'crew.no_ratings':       'Noch keine Bewertungen. Geh zur Artist-Liste und bewerte ein paar Acts!',
    'crew.no_crew_ratings':  'Noch keine Crew-Bewertungen vorhanden.',
    'crew.rated':            'bewertet',
    'crew.heard':            'reingehört',
    'crew.crew_total':       'Crew gesamt',
    'crew.self':             'Du',
    'crew.context_hint':     'Crew wechseln = Festival wechseln (Profil oben rechts)',
    'crew.filter_back':      'Zurück zur Crew-Ansicht',
    'crew.name_required':    'Bitte einen Crew-Namen eingeben.',
    'crew.code_required':    'Bitte einen Code eingeben.',
    'crew.already_in_crew':  'Du bist bereits in einer Crew für dieses Festival.',
    'crew.error':            'Fehler — bitte nochmal versuchen.',
    'crew.code_not_found':   'Code nicht gefunden. Bitte prüfen.',
    'crew.code_own':         'Das ist dein eigener Code — schick ihn an andere.',
    'crew.code_used':        'Dieser Code wurde bereits verwendet.',
    'crew.already_member':   'Du bist bereits in dieser Crew.',
    'crew.already_in_another':'Du bist bereits in einer Crew. Verlasse erst deine aktuelle Crew.',
    'crew.leave_confirm':    'Crew wirklich verlassen?',
    'crew.passphrase_missing_crew': '⚠ Noch keine Passphrase – auf der Artists-Seite einrichten',
    'crew.regen_confirm':    'Neuen Code generieren? Der alte Code funktioniert dann nicht mehr.',
    'crew.loading':          'Lade...',
    'crew.member':           'Mitglied',
    'crew.members':          'Mitglieder',
    'crew.filter_view':      'Ansicht:',
    'crew.score_q1':         'Das reicht für einen Händedruck, MacGyver.',
    'crew.score_q2':         'Ähnlich wie Knight Rider und ein normales Auto.',
    'crew.score_q3':         '1.21 Gigawatt Potenzial.',
    'crew.score_q4':         'Ich liebe es wenn ein Plan funktioniert.',
    'crew.score_q5':         'TURBO BOOST. Das ist euer Match.',

    // Admin
    'admin.title':             'Admin-Bereich',
    'admin.festival_section':  'Festival',
    'admin.artists_section':   'Artists',
    'admin.users_section':     'Nutzer*innen',
    'admin.save_festival':     'Festival speichern / anlegen',
    'admin.add_artist_btn':    'Artist hinzufügen',
    'admin.json_import':       'JSON importieren',
    'admin.json_hint':         'JSON-Import (Ausgabe des Scrapers einfügen):',
    'admin.col_name':          'Name',
    'admin.col_email':         'E-Mail',
    'admin.col_role':          'Rolle',
    'admin.col_time':          'Zeit',
    'admin.col_sc':            'SoundCloud',
    'admin.edit':              'Bearbeiten',
    'admin.loading':           'Lade...',
    'admin.no_artists':        'Noch keine Artists. Importiere sie über den Scraper oder füge sie manuell hinzu.',
    'admin.artist_added':      'Artist hinzugefügt',
    'admin.artist_name_required': 'Name und Stage sind Pflicht',
    'admin.json_empty':        'Kein JSON eingegeben',
    'admin.festival_saved':    'Festival gespeichert',
    'admin.festival_name_required': 'Festival-Name fehlt',
    'admin.artists_imported':  'Artists importiert',
    'admin.artist_updated':    'Artist aktualisiert',
    'admin.role_set':          'Rolle auf gesetzt',
    'admin.error':             'Fehler: ',
    'admin.not_array':         'Erwartet ein Array von Artists',
    'admin.no_festival':       'Kein Festival gefunden',
    'admin.no_access':         'Kein Zugriff. Nur Admins dürfen diese Seite sehen.',
    'admin.back':              '← Zurück zur App',
    'admin.artist_name_prompt':'Artistname:',
    'admin.sc_prompt':         'SoundCloud URL:',
    'admin.day_prompt':        'Tag (wednesday/thursday/friday/saturday/sunday):',
    'admin.start_prompt':      'Startzeit (Dezimal, z.B. 23.5 für 23:30):',
    'admin.end_prompt':        'Endzeit (Dezimal, z.B. 1.0 für 01:00):',

    // Hilfe-Seite
    'help.title':           'Hilfe & FAQ',
    'help.hero_title':      'Was ist HEARD?',
    'help.section_festival':'Festival & Admin',
    'help.section_crew':    'Crew',
    'help.section_features':'Nutzung & Features',

    // Lade-Zustände
    'loading.artists': 'Lade Artists...',
    'loading.generic': 'Lade...',
  },

  en: {
    // Navigation
    'nav.artists':   'Artists',
    'nav.timetable': 'Timetable',
    'nav.crew':      'Crew',
    'nav.help':      'Help',
    'nav.admin':     'Admin',

    // Login
    'login.tagline':   'Listen in, rate artists, plan your personal festival timetable.',
    'login.google':    'Sign in with Google',
    'login.microsoft': 'Sign in with Microsoft',

    // Offline-Login
    'offline.greeting':    "You're offline.",
    'offline.hint':        'Enter your festival passphrase to continue.',
    'offline.placeholder': 'Festival passphrase...',
    'offline.btn':         'Log in offline',
    'offline.error':       'Wrong passphrase. Try again?',
    'offline.forgot':      'Forgotten? Connect to WiFi → Google login → Profile → set new passphrase.',

    // Offline-Banner
    'offline.banner': "Offline — changes will be saved and synced when you're back online",

    // Filter
    'filter.search':     'Search artists...',
    'filter.all_stages': 'All Stages',
    'filter.all':        'All',
    'filter.unrated':    'Not yet rated',
    'filter.rated':      'Rated',
    'filter.favorites':  'Favorites ♥',
    'filter.listened':   'Listened',
    'filter.crew_commented': 'Crew comments 💬',

    // Sort
    'sort.name_asc':    'A → Z',
    'sort.name_desc':   'Z → A',
    'sort.rating_desc': 'Highest rating first',
    'sort.rating_asc':  'Lowest rating first',

    // Rating-Panel
    'panel.my_rating':       'My Rating',
    'panel.before_festival': 'Before the Festival',
    'panel.on_festival':     'At the Festival',
    'panel.listened':        'Listened',
    'panel.favorite':        'Favorite — want to see ♥',
    'panel.seen':            'Seen ✓',
    'panel.comment':         'Comment',
    'panel.save':            'Save',
    'panel.saving':          'Saving...',
    'panel.saved':           'Saved ✓',
    'panel.crew':            'Crew',
    'panel.no_crew_ratings': 'No crew ratings yet',
    'panel.no_soundcloud':   'No SoundCloud link available',
    'panel.soundcloud':      'Listen on SoundCloud',

    // Toasts / Messages
    'toast.login_error':    'Login failed',
    'toast.ms_login_error': 'Microsoft login failed',
    'toast.lineup_updated': 'Lineup updated ✓',
    'toast.offline_saved':  "Saved offline — will sync when you're back online",
    'toast.save_error':     'Error saving',
    'toast.passphrase_saved': "Passphrase saved. I'll be back — offline too.",
    'toast.min_length':     'Please enter at least 6 characters',
    'toast.festival_switched': 'Festival switched:',
    'toast.synced':         'rating(s) synced',

    // SW-Update-Toast
    'sw.updating':       'Updating app…',
    'sw.update_waiting': "Update available — will load once you're done",

    // Empty states
    'empty.no_artists_admin':  'No artists loaded yet. An admin needs to run the scraper first.',
    'empty.no_artists_filter': 'No artists match this filter.',

    // Passphrase setup
    'passphrase.title':           'Set up your Festival Passphrase',
    'passphrase.hint':            "There's no internet at the festival. This passphrase lets you log in anyway.",
    'passphrase.write_down':      'Write it down — or send it to yourself via WhatsApp.',
    'passphrase.suggestion_label':'Suggestion (tap to use):',
    'passphrase.divider':         '— or enter your own passphrase —',
    'passphrase.input_1':         'Enter passphrase...',
    'passphrase.input_2':         'Confirm passphrase...',
    'passphrase.mismatch':        "Passphrases don't match.",
    'passphrase.save':            'Save Passphrase',
    'passphrase.saving':          'Saving...',
    'passphrase.skip':            'Set up later',

    // Profile modal
    'profile.switch':             'Switch',
    'profile.passphrase_ok':      '✓ Offline passphrase set up',
    'profile.passphrase_missing': '⚠ No offline passphrase yet',
    'profile.passphrase_change':  'Change',
    'profile.passphrase_setup':   'Set up',
    'profile.logout':             'Log out',

    // Festival switcher
    'festival.switch_title':     'Switch Festival',
    'festival.create_btn':       '+ Create New Festival',
    'festival.new_title':        'New Festival',
    'festival.template':         'Template',
    'festival.name_label':       'Name',
    'festival.location_label':   'Location / Country',
    'festival.year_label':       'Year',
    'festival.create':           'Create Festival',
    'festival.creating':         'Creating...',
    'festival.name_required':    'Please enter a festival name.',
    'festival.error':            'Error: ',
    'festival.name_placeholder': 'Festival name...',
    'festival.loc_placeholder':  'e.g. Croatia',

    // Timetable
    'timetable.title':        'My Timetable',
    'timetable.loading':      'Loading...',
    'timetable.no_favorites': 'No favorites yet — go to the artist list and rate some acts!',
    'timetable.no_times':     'Timetable (times) not available yet. Here are your favorites:',
    'timetable.no_day':       'No favorites on this day.',
    'timetable.conflict':     'Time conflict ⚡',
    'timetable.min_rating':   'Also include from:',
    'timetable.only_hearts':  'Only ♥',
    'timetable.view_label':   'View:',
    'timetable.view_mine':    'Just me',
    'timetable.view_crew':    '+ Crew',
    'timetable.you':          'You',

    // Crew page
    'crew.no_crew':          "You're not in a crew for this festival yet.",
    'crew.create_title':     'Create a new crew',
    'crew.create_hint':      'Give your crew a name and share the generated code:',
    'crew.create_placeholder':'e.g. The Hive Faction',
    'crew.create_btn':       'Create Crew',
    'crew.creating':         'Creating...',
    'crew.or':               'or',
    'crew.join_title':       'Join a crew',
    'crew.join_hint':        'Enter the code you received from someone:',
    'crew.join_btn':         'Join',
    'crew.joining':          'Connecting...',
    'crew.invite_title':     'Expand your crew',
    'crew.invite_hint':      'Share this code with friends — it stays the same:',
    'crew.copy':             'Copy',
    'crew.copied':           'Copied ✓',
    'crew.leave':            'Leave Crew',
    'crew.leaving':          'Leaving...',
    'crew.shared_title':     'Everyone wants to see 🔥',
    'crew.match_title':      'Other Crews at the Festival',
    'crew.ratings_title':    'Crew Ratings',
    'crew.no_other_crews':   'No other crews at this festival yet — coming soon! 🎪',
    'crew.no_ratings':       'No ratings yet. Go to the artist list and rate some acts!',
    'crew.no_crew_ratings':  'No crew ratings yet.',
    'crew.rated':            'rated',
    'crew.heard':            'listened',
    'crew.crew_total':       'crew total',
    'crew.self':             'You',
    'crew.context_hint':     'Switch crew = switch festival (Profile top right)',
    'crew.filter_back':      'Back to crew view',
    'crew.name_required':    'Please enter a crew name.',
    'crew.code_required':    'Please enter a code.',
    'crew.already_in_crew':  "You're already in a crew for this festival.",
    'crew.error':            'Error — please try again.',
    'crew.code_not_found':   'Code not found. Please check.',
    'crew.code_own':         "That's your own code — share it with others.",
    'crew.code_used':        'This code has already been used.',
    'crew.already_member':   "You're already in this crew.",
    'crew.already_in_another':"You're already in a crew. Leave your current crew first.",
    'crew.leave_confirm':    'Really leave this crew?',
    'crew.passphrase_missing_crew': '⚠ No passphrase yet — set one up on the Artists page',
    'crew.regen_confirm':    'Generate a new code? The old code will stop working.',
    'crew.loading':          'Loading...',
    'crew.member':           'member',
    'crew.members':          'members',
    'crew.filter_view':      'View:',
    'crew.score_q1':         'A handshake will do, MacGyver.',
    'crew.score_q2':         'Similar to Knight Rider and a regular car.',
    'crew.score_q3':         '1.21 Gigawatts of potential.',
    'crew.score_q4':         'I love it when a plan comes together.',
    'crew.score_q5':         "TURBO BOOST. That's your match.",

    // Admin
    'admin.title':             'Admin Panel',
    'admin.festival_section':  'Festival',
    'admin.artists_section':   'Artists',
    'admin.users_section':     'Users',
    'admin.save_festival':     'Save / Create Festival',
    'admin.add_artist_btn':    'Add Artist',
    'admin.json_import':       'Import JSON',
    'admin.json_hint':         'JSON Import (paste scraper output):',
    'admin.col_name':          'Name',
    'admin.col_email':         'Email',
    'admin.col_role':          'Role',
    'admin.col_time':          'Time',
    'admin.col_sc':            'SoundCloud',
    'admin.edit':              'Edit',
    'admin.loading':           'Loading...',
    'admin.no_artists':        'No artists yet. Import via scraper or add manually.',
    'admin.artist_added':      'Artist added',
    'admin.artist_name_required': 'Name and stage are required',
    'admin.json_empty':        'No JSON entered',
    'admin.festival_saved':    'Festival saved',
    'admin.festival_name_required': 'Festival name is missing',
    'admin.artists_imported':  'artists imported',
    'admin.artist_updated':    'Artist updated',
    'admin.role_set':          'Role set to',
    'admin.error':             'Error: ',
    'admin.not_array':         'Expected an array of artists',
    'admin.no_festival':       'No festival found',
    'admin.no_access':         'No access. Only admins can view this page.',
    'admin.back':              '← Back to app',
    'admin.artist_name_prompt':'Artist name:',
    'admin.sc_prompt':         'SoundCloud URL:',
    'admin.day_prompt':        'Day (wednesday/thursday/friday/saturday/sunday):',
    'admin.start_prompt':      'Start time (decimal, e.g. 23.5 for 23:30):',
    'admin.end_prompt':        'End time (decimal, e.g. 1.0 for 01:00):',

    // Help page
    'help.title':           'Help & FAQ',
    'help.hero_title':      'What is HEARD?',
    'help.section_festival':'Festival & Admin',
    'help.section_crew':    'Crew',
    'help.section_features':'Features & Usage',

    // Loading states
    'loading.artists': 'Loading artists...',
    'loading.generic': 'Loading...',
  },
};

// 80er-Zitate mit englischen Varianten
const QUOTES = {
  de: {
    fiveStars: [
      'Ich liebe es wenn ein Plan funktioniert.',
      'Das war kein Zufall — das war Talent.',
      'Schön. Sehr schön sogar.',
    ],
    oneStar: [
      'Wissen Sie, ich hab heute schon 4 Touchdowns gemacht.',
      'Ich hab Schlimmeres überlebt, Murdock.',
      'Ha! I kill me.',
    ],
    offlineLoginSuccess: [
      "I'll be back. Aber erstmal: du bist drin.",
      'Turbo Boost, KITT. Wir fahren offline.',
      'Nobody puts Baby offline.',
    ],
    passphraseSetup: [
      'Ha! I kill me. Und meine Passphrase.',
      'Du hast 5 Sekunden. Okay, mehr. Aber denk nach.',
      'Schreib sie auf. Wirklich. Al Bundy hätte es nicht getan — und schau wie es ihm geht.',
    ],
    timetableConflict: [
      'Turbo Boost, KITT — ich brauch eine andere Route!',
      'Murdock, wir können nicht an zwei Orten gleichzeitig sein.',
      'MacGyver hätte sich das besser eingeteilt.',
    ],
    commentPlaceholders: [
      'Ha! I kill me.',
      'Was sagst du wenn du nach Hause kommst?',
      "Sag's wie Al Bundy: kurz, ehrlich, unvergesslich.",
      'Drei Worte. Oder Emojis. Oder beides.',
      'Murdock würde hier etwas Verrücktes schreiben.',
      'Was hat dein Unterbewusstsein gehört?',
      "\"Ich komm' wieder.\" — und wie war's?",
      'MacGyver-Analyse: Potential vorhanden?',
    ],
    emptyOffline: [
      'Ich bin nicht hier um zu verlieren.',
      'Ohne Daten kann auch Hannibal keinen Plan machen.',
    ],
  },
  en: {
    fiveStars: [
      'I love it when a plan comes together.',
      'That was no accident — that was talent.',
      'Nice. Very nice indeed.',
    ],
    oneStar: [
      'I once scored 4 touchdowns in a single game.',
      "I've survived worse, Murdock.",
      'Ha! I kill me.',
    ],
    offlineLoginSuccess: [
      "I'll be back. But first: you're in.",
      "Turbo Boost, KITT. We're going offline.",
      'Nobody puts Baby offline.',
    ],
    passphraseSetup: [
      'Ha! I kill me. And my passphrase.',
      "You've got 5 seconds. Okay, more. But think.",
      "Write it down. Seriously. Al Bundy wouldn't have — and look how that turned out.",
    ],
    timetableConflict: [
      'Turbo Boost, KITT — I need another route!',
      "Murdock, we can't be in two places at once.",
      'MacGyver would have planned this better.',
    ],
    commentPlaceholders: [
      'Ha! I kill me.',
      'What do you say when you get home?',
      'Keep it like Al Bundy: short, honest, unforgettable.',
      'Three words. Or emojis. Or both.',
      'Murdock would write something crazy here.',
      'What did your subconscious hear?',
      "\"I'll be back.\" — so how was it?",
      'MacGyver analysis: potential detected?',
    ],
    emptyOffline: [
      "I'm not here to lose.",
      "Without data, even Hannibal can't make a plan.",
    ],
  },
};

// ── Exports ──

export function getLang() {
  return localStorage.getItem('heard_lang') || 'de';
}

export function setLang(lang) {
  localStorage.setItem('heard_lang', lang);
  document.documentElement.lang = lang;
}

export function t(key) {
  const lang = getLang();
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.de[key] ?? key;
}

export function randomQuote(key) {
  const lang = getLang();
  const arr = QUOTES[lang]?.[key] ?? QUOTES.de[key] ?? [];
  return arr[Math.floor(Math.random() * arr.length)] || '';
}

export function applyTranslations() {
  const lang = getLang();
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

export function setupLangToggle() {
  document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      applyTranslations();
    });
  });
}
