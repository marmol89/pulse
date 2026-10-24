import { bytesToBase64 } from './nativeHttp.js';

const ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'];

/** El WebView de Android no trae la Media Session API: tampoco MediaMetadata. */
export class NativeMediaMetadata {
  constructor({ title = '', artist = '', album = '', artwork = [] } = {}) {
    Object.assign(this, { title, artist, album, artwork: [...artwork] });
  }
}

/**
 * navigator.mediaSession de Android: el WebView no muestra la Media Session al sistema, así que esta
 * la reenvía al plugin nativo PulsePlayback (servicio en primer plano con notificación y MediaSession).
 * Con eso el audio sigue sonando en segundo plano y con la pantalla apagada (sin servicio, Android lo
 * silencia) y hay controles en la notificación, la pantalla de bloqueo y los auriculares.
 * MediaSessionBridge la usa igual que la del navegador: la interfaz no sabe de Android.
 *
 * @param {{ plugin: { setMetadata, setState, addListener }, fetch: typeof fetch }} options
 */
export function createNativeMediaSession({ plugin, fetch }) {
  const handlers = new Map();
  let metadata = null;
  let playbackState = 'none';
  let position = { position: 0, duration: 0 };
  let metadataCount = 0;

  plugin.addListener('action', ({ action, seekTime }) => handlers.get(action)?.({ action, seekTime }));

  const sendState = () => plugin.setState({ state: playbackState, ...position }).catch(() => {});

  /** La carátula llega como URL blob: (o de archivo de la app): el plugin la recibe en base64. */
  async function readArtwork(artwork) {
    const src = artwork?.at(-1)?.src;
    if (!src) return null;
    try {
      const response = await fetch(src);
      return response.ok ? bytesToBase64(new Uint8Array(await response.arrayBuffer())) : null;
    } catch {
      return null;
    }
  }

  async function sendMetadata(value) {
    const count = ++metadataCount;
    const fields = value ? { title: value.title ?? '', artist: value.artist ?? '', album: value.album ?? '' } : null;
    const artwork = value ? await readArtwork(value.artwork) : null;
    // Si mientras se leía la carátula llegaron otros datos, estos ya no valen.
    if (count === metadataCount) await plugin.setMetadata({ metadata: fields && { ...fields, artwork } }).catch(() => {});
  }

  return {
    get metadata() {
      return metadata;
    },
    set metadata(value) {
      metadata = value;
      sendMetadata(value);
    },
    get playbackState() {
      return playbackState;
    },
    set playbackState(value) {
      playbackState = value;
      if (value === 'none') position = { position: 0, duration: 0 };
      sendState();
    },
    setActionHandler(action, handler) {
      if (!ACTIONS.includes(action)) throw new TypeError(`Acción no admitida: ${action}`);
      if (handler) handlers.set(action, handler);
      else handlers.delete(action);
    },
    setPositionState({ duration = 0, position: current = 0 } = {}) {
      position = { position: current, duration };
      sendState();
    },
  };
}
