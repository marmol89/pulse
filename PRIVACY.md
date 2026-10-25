# Política de privacidad de Pulse

**Última actualización:** 25 de octubre de 2026

Pulse es un reproductor de música que reproduce los archivos que tú guardas en tu propio almacenamiento compatible con S3 (por ejemplo, Amazon S3 o MinIO). Esta política explica qué datos maneja la aplicación y con quién se comunican.

## Resumen

- Pulse **no tiene cuentas de usuario, anuncios, analítica ni seguimiento**.
- El desarrollador de Pulse **no recibe, almacena ni tiene acceso** a tu música, tus credenciales ni tus datos de uso.
- Pulse solo se comunica con **tu propio almacenamiento** y con **servicios públicos de metadatos** para completar carátulas, datos de álbum y letras.

## 1. Datos que se guardan en tu dispositivo

- **Configuración de tu almacenamiento:** endpoint, región, nombre del bucket, clave de acceso y clave secreta. Se guardan solo en tu dispositivo y se usan únicamente para conectar con tu almacenamiento. La clave secreta se guarda cifrada en el almacén seguro de Android (Android Keystore).
- **Caché y preferencias:** carátulas, letras, ajustes de la aplicación y datos necesarios para reproducir tu biblioteca.

Puedes borrar estos datos en cualquier momento eliminando los datos de la aplicación o desinstalándola.

## 2. Comunicación con tu almacenamiento S3

Pulse se conecta directamente al endpoint que tú configuras para:

- listar y reproducir tus archivos de audio;
- subir las canciones que elijas desde el móvil;
- guardar en tu bucket (carpeta `metadatos/`) una copia de tu biblioteca (con las carátulas y letras encontradas) y tus listas de canciones, para compartirlas entre tus dispositivos (móvil, Windows y Linux).

Pulse lee las etiquetas de tus archivos de audio, pero nunca las modifica.

Ese almacenamiento es tuyo y lo gestiona el proveedor que elijas, según sus propias condiciones y política de privacidad. El desarrollador de Pulse no tiene acceso a él. Te recomendamos usar un endpoint con HTTPS.

## 3. Servicios de metadatos de terceros

Para completar automáticamente carátulas, datos del álbum, año y letras, Pulse consulta estos servicios públicos:

- iTunes Search API (Apple): carátula, álbum, año y género.
- Deezer API: carátula y álbum, cuando iTunes no encuentra la canción.
- LRCLIB: letras.

En estas consultas se envía únicamente el título y el artista de la canción. **No se envían tus credenciales, tus archivos de audio ni identificadores personales.** Como en cualquier conexión a internet, estos servicios pueden ver la dirección IP de tu dispositivo, que tratan según sus propias políticas de privacidad.

## 4. Permisos de Android

- **Internet:** para conectar con tu almacenamiento y con los servicios de metadatos.
- **Servicio en primer plano de reproducción multimedia y bloqueo de activación:** para seguir reproduciendo música con la pantalla apagada y mostrar los controles en la notificación y la pantalla de bloqueo.

Pulse no pide acceso al almacenamiento del teléfono: para subir canciones usas el selector de archivos del sistema, y la aplicación solo recibe los archivos que eliges.

## 5. Datos que no recogemos

Pulse no recoge datos de ubicación, contactos, identificadores de publicidad ni información de uso, y no vende ni comparte datos personales con fines publicitarios.

## 6. Menores

Pulse no está dirigida a menores de 13 años y no recoge datos personales de ningún usuario.

## 7. Cambios en esta política

Si esta política cambia, publicaremos la versión actualizada en esta misma página e indicaremos la fecha de la última actualización.

## 8. Contacto

Si tienes cualquier pregunta sobre esta política, escribe a **admin@marmol89.com**.
