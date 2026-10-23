/**
 * Genera archivos WAV de prueba (tono senoidal) con etiquetas ID3v2.3 en un
 * chunk "id3 ", como hacen Picard o foobar2000. Así los tests y el e2e usan
 * audio real sin versionar música.
 */

const SAMPLE_RATE = 22050;

function textFrame(id, text) {
  // Codificación 1 = UTF-16 con BOM (admite tildes y eñes).
  return frame(id, Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(String(text), 'utf16le')]));
}

function lyricsFrame(text) {
  return frame(
    'USLT',
    Buffer.concat([Buffer.from([1]), Buffer.from('spa', 'latin1'), Buffer.from([0xff, 0xfe, 0, 0, 0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
  );
}

function pictureFrame(png) {
  // Codificación 0, MIME, tipo 3 (portada), descripción vacía, datos.
  return frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0', 'latin1'), Buffer.from([3, 0]), png]));
}

function frame(id, data) {
  const header = Buffer.alloc(10);
  header.write(id, 0, 'ascii');
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
}

function syncsafe(size) {
  return Buffer.from([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
}

function id3Tag({ title, artist, album, albumArtist, genre, track, year, lyrics, cover }) {
  const frames = [
    title && textFrame('TIT2', title),
    artist && textFrame('TPE1', artist),
    album && textFrame('TALB', album),
    albumArtist && textFrame('TPE2', albumArtist),
    genre && textFrame('TCON', genre),
    track && textFrame('TRCK', track),
    year && textFrame('TYER', year),
    lyrics && lyricsFrame(lyrics),
    cover && pictureFrame(cover),
  ].filter(Boolean);
  const body = Buffer.concat(frames);
  return Buffer.concat([Buffer.from('ID3', 'ascii'), Buffer.from([3, 0, 0]), syncsafe(body.length), body]);
}

function riffChunk(id, data) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

/** Tono de `seconds` segundos a `frequency` Hz con fundido para evitar chasquidos. */
function samples(seconds, frequency) {
  const count = Math.round(seconds * SAMPLE_RATE);
  const data = Buffer.alloc(count * 2);
  const fade = SAMPLE_RATE * 0.05;
  for (let i = 0; i < count; i += 1) {
    const envelope = Math.min(1, i / fade, (count - i) / fade);
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE) * envelope * 0.2 * 32767), i * 2);
  }
  return data;
}

/** @returns {Buffer} archivo WAV completo */
export function createWav({ seconds = 1, frequency = 440, tags = null } = {}) {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0); // PCM
  format.writeUInt16LE(1, 2); // mono
  format.writeUInt32LE(SAMPLE_RATE, 4);
  format.writeUInt32LE(SAMPLE_RATE * 2, 8);
  format.writeUInt16LE(2, 12);
  format.writeUInt16LE(16, 14);
  const chunks = [riffChunk('fmt ', format), riffChunk('data', samples(seconds, frequency))];
  if (tags) chunks.push(riffChunk('id3 ', id3Tag(tags)));
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), ...chunks]);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from(Uint32Array.of(body.length).buffer), body]);
}
