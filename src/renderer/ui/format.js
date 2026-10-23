/** 84 → "1:24", 3725 → "1:02:05". Valores no válidos → "0:00". */
export function formatTime(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

/** 5520 → "1 h 32 min", 2700 → "45 min", 3600 → "1 h". */
export function formatDuration(seconds) {
  const minutes = Math.round((Number(seconds) || 0) / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
}

/** plural(1, 'canción', 'canciones') → "1 canción". */
export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "24 canciones · 1 h 32 min" (sin duración si no se conoce). */
export function collectionStats(tracks) {
  const count = plural(tracks.length, 'canción', 'canciones');
  const total = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  return total > 0 ? `${count} · ${formatDuration(total)}` : count;
}

/** Saludo de la pantalla de Inicio según la hora. */
export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
