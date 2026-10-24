/** Clave del almacén seguro donde vive la clave secreta de S3. */
const SECRET_KEY = 's3-secret';
const MARKER = 'keystore';

/**
 * `encrypt`/`decrypt` de createConnectionStore en Android: la clave secreta se guarda en el almacén
 * seguro (Android Keystore, plugin @aparajita/capacitor-secure-storage) y en s3.json solo queda
 * una marca. Es el equivalente de safeStorage en escritorio.
 */
export function createKeystoreCrypto(SecureStorage) {
  return {
    async encrypt(text) {
      await SecureStorage.set(SECRET_KEY, text);
      return MARKER;
    },

    async decrypt(stored) {
      if (stored !== MARKER) throw new Error('Conexión guardada en un formato desconocido');
      const text = await SecureStorage.get(SECRET_KEY);
      if (typeof text !== 'string' || !text) throw new Error('La clave secreta ya no está en el almacén seguro');
      return { text };
    },
  };
}
