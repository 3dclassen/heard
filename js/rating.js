// ── HEARD — Rating-Hilfsfunktionen ──
// Reine Berechnungen, kein UI. Wird von app.js und timetable.js genutzt.

/**
 * Gibt das Rating eines bestimmten Users für einen Artist zurück.
 * @param {Array} ratings - Alle Ratings
 * @param {string} userId
 * @param {string} artistId
 */
export function getMyRating(ratings, userId, artistId) {
  return ratings.find(r => r.user_id === userId && r.artist_id === artistId) || null;
}

/**
 * Alle Ratings für einen Artist (alle User).
 */
export function getArtistRatings(ratings, artistId) {
  return ratings.filter(r => r.artist_id === artistId);
}

/**
 * Durchschnittliches Rating aller User für einen Artist.
 * Nur Ratings > 0 werden gezählt.
 */
export function avgRating(ratings, artistId) {
  const rs = getArtistRatings(ratings, artistId).filter(r => r.rating > 0);
  if (rs.length === 0) return 0;
  return rs.reduce((sum, r) => sum + r.rating, 0) / rs.length;
}

/**
 * Artists die alle übergebenen User als Favorit markiert haben.
 */
export function sharedFavorites(ratings, artists, userIds) {
  if (userIds.length === 0) return [];
  return artists.filter(a =>
    userIds.every(uid =>
      ratings.some(r => r.artist_id === a.id && r.user_id === uid && r.want_to_see)
    )
  );
}

/**
 * Gibt Favoriten eines Users zurück, sortiert nach Rating (desc).
 * @param {number} minRating - Artists ab dieser Sternebewertung zusätzlich zu ♥-Favoriten
 *   einschließen (0 = nur ♥-Favoriten, keine automatische Aufnahme über Sterne).
 */
export function myFavorites(ratings, artists, userId, minRating = 4) {
  return artists
    .filter(a => {
      const r = getMyRating(ratings, userId, a.id);
      return r?.want_to_see || (minRating > 0 && r?.rating >= minRating);
    })
    .sort((a, b) => {
      const ra = getMyRating(ratings, userId, a.id)?.rating || 0;
      const rb = getMyRating(ratings, userId, b.id)?.rating || 0;
      return rb - ra;
    });
}

/**
 * Favoriten der ganzen Crew (nicht nur des eigenen Users): ein Artist ist
 * dabei, sobald IRGENDEIN Mitglied ihn geherzt oder mit >= minRating bewertet hat.
 * Sortiert nach der besten Bewertung innerhalb der Crew (desc).
 */
export function crewFavorites(ratings, artists, userIds, minRating = 4) {
  const bestRating = a => Math.max(0, ...userIds.map(uid => getMyRating(ratings, uid, a.id)?.rating || 0));

  return artists
    .filter(a => userIds.some(uid => {
      const r = getMyRating(ratings, uid, a.id);
      return r?.want_to_see || (minRating > 0 && r?.rating >= minRating);
    }))
    .sort((a, b) => bestRating(b) - bestRating(a));
}

/**
 * Welche der übergebenen User haben einen Artist geherzt oder mit
 * >= minRating bewertet? Für die Zuschreibung "wer hat das ausgewählt".
 */
export function votersForArtist(ratings, artistId, userIds, minRating = 4) {
  return userIds.filter(uid => {
    const r = ratings.find(r => r.artist_id === artistId && r.user_id === uid);
    return r?.want_to_see || (minRating > 0 && r?.rating >= minRating);
  });
}

/**
 * Fortschritt: Wie viele Artists hat ein User bereits bewertet?
 */
export function ratingProgress(ratings, artists, userId) {
  const heard    = artists.filter(a => ratings.some(r => r.artist_id === a.id && r.user_id === userId && r.listened)).length;
  const rated    = artists.filter(a => ratings.some(r => r.artist_id === a.id && r.user_id === userId && r.rating > 0)).length;
  const total    = artists.length;
  return { heard, rated, total };
}

// ── Recap (Statistik-Zusammenfassung, js/recap.js) ──

function average(nums) {
  const positive = nums.filter(n => n > 0);
  if (positive.length === 0) return 0;
  return positive.reduce((a, b) => a + b, 0) / positive.length;
}

/**
 * Kernstatistik für einen einzelnen User — Basis sowohl für die persönliche Recap-Ansicht
 * als auch für jede Zeile im Crew-Leaderboard (crewRecap() ruft das pro Mitglied auf).
 * time_start/time_end auf Artists sind bereits so konzipiert, dass Sets nach Mitternacht
 * Werte > 24 haben (z.B. 25.5 = 1:30 Uhr) — dieselbe Konvention wie in timetable.js
 * findConflicts(), also keine Modulo-/Wrap-Sonderbehandlung nötig.
 */
export function personalRecap(ratings, artists, userId) {
  const myRatings   = ratings.filter(r => r.user_id === userId);
  const seenIds     = new Set(myRatings.filter(r => r.seen).map(r => r.artist_id));
  const seenArtists = artists.filter(a => seenIds.has(a.id));
  const withTime    = seenArtists.filter(a => a.time_start != null && a.time_end != null);

  const byDay = {};
  seenArtists.forEach(a => {
    if (!a.day) return;
    byDay[a.day] = (byDay[a.day] || 0) + 1;
  });

  const hoursByStage = {};
  withTime.forEach(a => {
    hoursByStage[a.stage] = (hoursByStage[a.stage] || 0) + (a.time_end - a.time_start);
  });

  const postRated = myRatings.filter(r => r.post_rating > 0);
  const surprises = postRated
    .map(r => ({
      artistId: r.artist_id,
      before:   r.rating || 0,
      after:    r.post_rating,
      delta:    r.post_rating - (r.rating || 0),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  return {
    seenCount:      seenArtists.length,
    totalCount:     artists.length,
    ratedCount:     myRatings.filter(r => r.rating > 0).length,
    favoritesCount: myRatings.filter(r => r.want_to_see).length,
    postRatedCount: postRated.length,
    hasTimeData:    withTime.length > 0,
    totalHours:     withTime.reduce((sum, a) => sum + (a.time_end - a.time_start), 0),
    byDay,
    hoursByStage,
    avgRatingBefore: average(postRated.map(r => r.rating || 0)),
    avgRatingAfter:  average(postRated.map(r => r.post_rating)),
    surprises,
  };
}

/**
 * Crew-Leaderboard: dieselbe Kernstatistik pro Mitglied, keine eigene Logik.
 */
export function crewRecap(ratings, artists, userIds) {
  return userIds.map(userId => ({ userId, ...personalRecap(ratings, artists, userId) }));
}
