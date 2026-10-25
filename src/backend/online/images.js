import { coverFile } from '../paths.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Descarga una imagen de internet a covers/ y devuelve su nombre (`<sha1 de la URL>.jpg`, el mismo en
 * metadatos/caratulas/ del bucket), o null si no se pudo. Si ya estaba, no la vuelve a descargar.
 * Un fallo pasajero (TransientError) se propaga; cualquier otro cuenta como "sin imagen".
 */
export async function saveImage({ http, files }, url, { isTransient = () => false } = {}) {
  if (!url) return null;
  const name = `${await sha1(url)}.jpg`;
  if (await files.exists(coverFile(name))) return name;
  let image = null;
  try {
    image = await http.image(url, MAX_IMAGE_BYTES);
  } catch (error) {
    if (isTransient(error)) throw error;
  }
  if (!image) return null;
  await files.write(coverFile(name), image.data);
  return name;
}

/** SHA-1 en hexadecimal con Web Crypto (está en Node y en el WebView). */
async function sha1(text) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
