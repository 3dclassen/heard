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
 */
export function myFavorites(ratings, artists, userId) {
  return artists
    .filter(a => {
      const r = getMyRating(ratings, userId, a.id);
      return r?.want_to_see || r?.rating >= 4;
    })
    .sort((a, b) => {
      const ra = getMyRating(ratings, userId, a.id)?.rating || 0;
      const rb = getMyRating(ratings, userId, b.id)?.rating || 0;
      return rb - ra;
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
