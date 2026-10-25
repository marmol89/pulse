import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

/**
 * Servidor S3 mínimo (estilo path, como MinIO) para tests y e2e sin red ni credenciales reales.
 * Entiende: ListBuckets, ListObjectsV2 (con paginación), HeadObject, GetObject con Range, PutObject, CopyObject
 * (PUT con x-amz-copy-source) y DeleteObject.
 * También lee con URLs firmadas (X-Amz-Credential en la query, como las del <audio> de Android).
 * Las peticiones firmadas con otra clave de acceso reciben 403 InvalidAccessKeyId; con `readOnly`,
 * las subidas, copias y borrados reciben 403 AccessDenied (claves sin permiso de escritura).
 * Cada objeto lleva su fecha de subida (LastModified): los iniciales, el 1 de enero de 2026; los demás, la de su subida.
 */
export async function startFakeS3({ accessKeyId = 'clave-de-prueba', buckets = { musica: {} }, pageSize = 1000, readOnly = false, host = '127.0.0.1' } = {}) {
  const data = new Map(Object.entries(buckets).map(([name, objects]) => [name, new Map(Object.entries(objects).map(([key, body]) => [key, Buffer.from(body)]))]));
  const modified = new Map(); // "bucket/clave" → fecha de subida (si no, la de los objetos iniciales)
  const requests = [];
  const state = { readOnly, offline: false };

  const server = createServer((req, res) => {
    if (state.offline) return req.socket.destroy(); // como si no hubiera red
    const url = new URL(req.url, 'http://localhost');
    const signedUrl = req.method === 'GET' && String(url.searchParams.get('X-Amz-Credential') ?? '').startsWith(`${accessKeyId}/`);
    requests.push({ method: req.method, path: decodeURIComponent(url.pathname), range: req.headers.range ?? null, signedUrl });
    // Firma en la cabecera o, para leer, una URL firmada (el <audio> de Android).
    if (!signedUrl && !String(req.headers.authorization ?? '').includes(`Credential=${accessKeyId}/`)) {
      return xml(res, 403, `<Error><Code>InvalidAccessKeyId</Code><Message>La clave no existe</Message></Error>`);
    }
    const [, bucketName, ...keyParts] = url.pathname.split('/');
    const key = decodeURIComponent(keyParts.join('/'));
    if (!bucketName) {
      const names = [...data.keys()].map((name) => `<Bucket><Name>${name}</Name><CreationDate>2026-01-01T00:00:00.000Z</CreationDate></Bucket>`);
      return xml(res, 200, `<ListAllMyBucketsResult><Buckets>${names.join('')}</Buckets></ListAllMyBucketsResult>`);
    }
    const bucket = data.get(bucketName);
    if (!bucket) return xml(res, 404, `<Error><Code>NoSuchBucket</Code><Message>No existe</Message></Error>`);
    if (!key) return list(res, bucketName, bucket, url.searchParams, pageSize, (name) => modified.get(`${bucketName}/${name}`));
    if (req.method === 'PUT' && req.headers['x-amz-copy-source']) {
      return copy(res, data, bucket, key, req.headers['x-amz-copy-source'], state.readOnly, () => modified.set(`${bucketName}/${key}`, new Date()));
    }
    if (req.method === 'DELETE') {
      if (state.readOnly) return xml(res, 403, `<Error><Code>AccessDenied</Code><Message>Acceso denegado</Message></Error>`);
      bucket.delete(key);
      return res.writeHead(204).end();
    }
    if (req.method === 'PUT') return put(req, res, bucket, key, state.readOnly, () => modified.set(`${bucketName}/${key}`, new Date()));
    const body = bucket.get(key);
    if (!body) {
      if (req.method === 'HEAD') return res.writeHead(404).end();
      return xml(res, 404, `<Error><Code>NoSuchKey</Code><Message>No existe</Message></Error>`);
    }
    return object(req, res, body);
  });

  await new Promise((resolve) => server.listen(0, host, resolve)); // host '0.0.0.0': visible desde un móvil de la red
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  return {
    endpoint,
    requests,
    config: { endpoint, accessKeyId, secretAccessKey: 'secreto-de-prueba', bucket: Object.keys(buckets)[0], prefix: '' },
    put(bucketName, key, body, date = new Date()) {
      data.get(bucketName).set(key, Buffer.from(body));
      modified.set(`${bucketName}/${key}`, date);
    },
    /** Claves de un bucket, en orden. */
    keys(bucketName) {
      return [...data.get(bucketName).keys()].sort();
    },
    /** Contenido de un objeto (Buffer) o undefined. */
    get(bucketName, key) {
      return data.get(bucketName).get(key);
    },
    setReadOnly(value) {
      state.readOnly = value;
    },
    /** Sin red: corta las conexiones abiertas y las nuevas. */
    setOffline(value) {
      state.offline = value;
      if (value) server.closeAllConnections();
    },
    remove(bucketName, key) {
      data.get(bucketName).delete(key);
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function put(req, res, bucket, key, readOnly, onStored) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (readOnly) return xml(res, 403, `<Error><Code>AccessDenied</Code><Message>Acceso denegado</Message></Error>`);
  // Un S3 compatible antiguo no entiende el cuerpo "aws-chunked" con sumas CRC: el cliente no debe usarlo.
  if (String(req.headers['content-encoding'] ?? '').includes('aws-chunked')) {
    return xml(res, 501, `<Error><Code>NotImplemented</Code><Message>aws-chunked</Message></Error>`);
  }
  const body = Buffer.concat(chunks);
  if (req.headers['content-length'] && Number(req.headers['content-length']) !== body.length) {
    return xml(res, 400, `<Error><Code>IncompleteBody</Code><Message>Tamaño incorrecto</Message></Error>`);
  }
  bucket.set(key, body);
  onStored();
  res.writeHead(200, { ETag: etag(body) }).end();
}

/** CopyObject: la fuente llega como "bucket/clave" con la clave codificada como en una URL. */
function copy(res, data, bucket, key, header, readOnly, onStored) {
  if (readOnly) return xml(res, 403, `<Error><Code>AccessDenied</Code><Message>Acceso denegado</Message></Error>`);
  const [sourceBucket, ...sourceParts] = decodeURIComponent(String(header).replace(/^\//, '')).split('/');
  const body = data.get(sourceBucket)?.get(sourceParts.join('/'));
  if (!body) return xml(res, 404, `<Error><Code>NoSuchKey</Code><Message>No existe</Message></Error>`);
  bucket.set(key, body);
  onStored();
  return xml(res, 200, `<CopyObjectResult><LastModified>${new Date().toISOString()}</LastModified><ETag>${escape(etag(body))}</ETag></CopyObjectResult>`);
}

const INITIAL_DATE = new Date('2026-01-01T00:00:00.000Z');

function etag(body) {
  return `"${createHash('md5').update(body).digest('hex')}"`;
}

function xml(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/xml' }).end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
}

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function list(res, name, bucket, params, pageSize, modifiedOf) {
  const prefix = params.get('prefix') ?? '';
  const maxKeys = Math.min(Number(params.get('max-keys') ?? 1000), pageSize);
  const keys = [...bucket.keys()].filter((key) => key.startsWith(prefix)).sort();
  const start = Number(params.get('continuation-token') ?? 0);
  const page = keys.slice(start, start + maxKeys);
  const truncated = start + maxKeys < keys.length;
  const contents = page.map((key) => {
    const body = bucket.get(key);
    return `<Contents><Key>${escape(key)}</Key><LastModified>${(modifiedOf(key) ?? INITIAL_DATE).toISOString()}</LastModified><ETag>${escape(etag(body))}</ETag><Size>${body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
  });
  xml(
    res,
    200,
    `<ListBucketResult><Name>${name}</Name><Prefix>${escape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys><IsTruncated>${truncated}</IsTruncated>${
      truncated ? `<NextContinuationToken>${start + maxKeys}</NextContinuationToken>` : ''
    }${contents.join('')}</ListBucketResult>`,
  );
}

function object(req, res, body) {
  const headers = { 'Content-Type': 'application/octet-stream', ETag: etag(body), 'Accept-Ranges': 'bytes', 'Last-Modified': 'Thu, 01 Jan 2026 00:00:00 GMT' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (!match) {
    res.writeHead(200, { ...headers, 'Content-Length': body.length });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  const start = match[1] === '' ? Math.max(body.length - Number(match[2]), 0) : Number(match[1]);
  const end = match[1] !== '' && match[2] !== '' ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
  if (start >= body.length) return res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }).end();
  res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${body.length}` });
  return res.end(req.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
}
