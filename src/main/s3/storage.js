import { S3Client, ListBucketsCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { isAudioFile } from '../library/tracks.js';

/**
 * Acceso al bucket de música (S3 o compatible, como MinIO): leer y subir canciones; nunca borra.
 * Estilo path ("https://servidor/bucket/clave"), que es lo que esperan MinIO y similares.
 *
 * @typedef {{ endpoint: string, accessKeyId: string, secretAccessKey: string, bucket: string, prefix?: string, region?: string }} S3Config
 */
export function createS3Storage({ endpoint, accessKeyId, secretAccessKey, bucket, prefix = '', region = 'us-east-1' }) {
  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2,
    // Sin sumas CRC32 opcionales: los servicios compatibles (MinIO antiguos, etc.) no siempre las entienden.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return {
    bucket,
    prefix,

    async listBuckets() {
      const { Buckets = [] } = await client.send(new ListBucketsCommand({}));
      return Buckets.map((entry) => entry.Name);
    },

    /** Todos los archivos de audio del bucket (bajo el prefijo), con tamaño y ETag. */
    async listAudio() {
      const objects = [];
      let token;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken: token }));
        for (const item of page.Contents ?? []) {
          if (isAudioFile(item.Key)) objects.push({ key: item.Key, size: item.Size ?? 0, etag: item.ETag ?? '' });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return objects;
    },

    /** Los primeros `bytes` bytes de un objeto (para leer sus etiquetas sin descargarlo entero). */
    async readStart(key, bytes) {
      const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
      return Body.transformToByteArray();
    },

    /** El objeto (o un rango) como stream web, con las cabeceras para responder al <audio>. */
    async getObject(key, range) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range || undefined }));
      return {
        status: result.ContentRange ? 206 : 200,
        contentLength: result.ContentLength,
        contentRange: result.ContentRange,
        body: result.Body.transformToWebStream(),
      };
    },

    /** Tamaño del objeto, o null si no está en el bucket. */
    async stat(key) {
      try {
        const { ContentLength } = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: ContentLength ?? 0 };
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return null;
        throw error;
      }
    },

    /** ¿Sigue el objeto en el bucket? */
    async exists(key) {
      return (await this.stat(key)) !== null;
    },

    /** Sube un objeto (`body`: Buffer o stream de Node, con su tamaño exacto en `size`). */
    async upload(key, body, { size, contentType }) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: size, ContentType: contentType }));
    },

    destroy() {
      client.destroy();
    },
  };
}

/** Mensaje en español para un error al subir: sin permiso de escritura, o el de describeS3Error. */
export function describeUploadError(error) {
  const code = error?.Code ?? error?.name ?? '';
  if (code === 'AccessDenied' || (error?.$metadata?.httpStatusCode === 403 && code !== 'InvalidAccessKeyId' && code !== 'SignatureDoesNotMatch')) {
    return 'Tus claves no tienen permiso para subir canciones a este bucket';
  }
  return describeS3Error(error);
}

/** Mensaje en español para un error de conexión con S3. */
export function describeS3Error(error) {
  const code = error?.Code ?? error?.name ?? error?.code ?? '';
  if (['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'AccessDenied', 'Forbidden'].includes(code) || error?.$metadata?.httpStatusCode === 403) {
    return 'Las claves no son válidas o no tienen permiso para leer el bucket';
  }
  if (code === 'NoSuchBucket') return 'Ese bucket no existe';
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET'].includes(error?.code ?? error?.cause?.code) || code === 'TimeoutError') {
    return 'No se pudo conectar con el servidor';
  }
  return `No se pudo acceder al almacenamiento (${code || error?.message || 'error desconocido'})`;
}
