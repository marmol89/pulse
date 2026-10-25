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
/** Tamaño legible: "850 KB", "12 MB", "1,4 GB". */
export function formatBytes(bytes) {
  const units = ['KB', 'MB', 'GB'];
  let value = Math.max(0, Number(bytes) || 0) / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toLocaleString('es', { maximumFractionDigits: digits })} ${units[unit]}`;
}

export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "24 canciones · 1 h 32 min" (sin duración si no se conoce). */
export function collectionStats(tracks) {
  const count = plural(tracks.length, 'canción', 'canciones');
  const total = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  return total > 0 ? `${count} · ${formatDuration(total)}` : count;
}

/**
 * Etiqueta legible de una salida de audio: sin ids USB ("(046d:0aba)") y con el
 * prefijo "Default - " de Chromium (siempre en inglés) traducido.
 */
export function formatDeviceLabel(device, index = 0) {
  const name = (device?.label ?? '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '').trim();
  if (device?.id === 'default') {
    const target = name.replace(/^default\b\s*-?\s*/i, '');
    return target ? `Predeterminado · ${target}` : 'Predeterminado del sistema';
  }
  return name || `Salida de audio ${index + 1}`;
}

/** 9 y 15 → "9 de 15"; sin total → "9"; sin número → "". */
export function formatTrackNumber(number, count) {
  if (!number) return '';
  return count ? `${number} de ${count}` : String(number);
}

/** De dónde salen los datos: "Del archivo y de iTunes · letra de LRCLIB". */
export function formatDataSource(online) {
  const parts = [online?.status === 'found' ? `Del archivo y de ${online.source}` : 'Del archivo'];
  if (online?.lyricsSource) parts.push(`letra de ${online.lyricsSource}`);
  return parts.join(' · ');
}

/** Filas [etiqueta, valor] de la tarjeta "Información" de Reproduciendo, solo con valor. */
export function trackDetails(track) {
  const rows = [
    ['Álbum', track.album],
    ['Artista del álbum', track.albumArtist && track.albumArtist !== track.artist ? track.albumArtist : ''],
    ['Año', track.year ? String(track.year) : ''],
    ['Género', track.genre],
    ['Pista', formatTrackNumber(track.trackNo, track.trackCount)],
    ['Duración', track.duration ? formatTime(track.duration) : ''],
    ['Datos', formatDataSource(track.online)],
  ];
  return rows.filter(([, value]) => value);
}

/** Saludo de la pantalla de Inicio según la hora. */
export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
