import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

/**
 * Servidor S3 mínimo (estilo path, como MinIO) para tests y e2e sin red ni credenciales reales.
 * Entiende: ListBuckets, ListObjectsV2 (con paginación), HeadObject y GetObject con Range.
 * Las peticiones firmadas con otra clave de acceso reciben 403 InvalidAccessKeyId.
 */
export async function startFakeS3({ accessKeyId = 'clave-de-prueba', buckets = { musica: {} }, pageSize = 1000 } = {}) {
  const data = new Map(Object.entries(buckets).map(([name, objects]) => [name, new Map(Object.entries(objects).map(([key, body]) => [key, Buffer.from(body)]))]));
  const requests = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push({ method: req.method, path: decodeURIComponent(url.pathname), range: req.headers.range ?? null });
    if (!String(req.headers.authorization ?? '').includes(`Credential=${accessKeyId}/`)) {
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
    if (!key) return list(res, bucketName, bucket, url.searchParams, pageSize);
    const body = bucket.get(key);
    if (!body) {
      if (req.method === 'HEAD') return res.writeHead(404).end();
      return xml(res, 404, `<Error><Code>NoSuchKey</Code><Message>No existe</Message></Error>`);
    }
    return object(req, res, body);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  return {
    endpoint,
    requests,
    config: { endpoint, accessKeyId, secretAccessKey: 'secreto-de-prueba', bucket: Object.keys(buckets)[0], prefix: '' },
    put(bucketName, key, body) {
      data.get(bucketName).set(key, Buffer.from(body));
    },
    remove(bucketName, key) {
      data.get(bucketName).delete(key);
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function etag(body) {
  return `"${createHash('md5').update(body).digest('hex')}"`;
}

function xml(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/xml' }).end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
}

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function list(res, name, bucket, params, pageSize) {
  const prefix = params.get('prefix') ?? '';
  const maxKeys = Math.min(Number(params.get('max-keys') ?? 1000), pageSize);
  const keys = [...bucket.keys()].filter((key) => key.startsWith(prefix)).sort();
  const start = Number(params.get('continuation-token') ?? 0);
  const page = keys.slice(start, start + maxKeys);
  const truncated = start + maxKeys < keys.length;
  const contents = page.map((key) => {
    const body = bucket.get(key);
    return `<Contents><Key>${escape(key)}</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>${escape(etag(body))}</ETag><Size>${body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
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
