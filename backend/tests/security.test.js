const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
const { createApp } = require('../index');

// Every fixture uses its own real SQLite database and disposable photo storage.
// Requiring index.js must never initialize the owner's database or start a server.
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-security-'));
  const dataDir = path.join(directory, 'data');
  const app = createApp({
    dataDir, dbPath: path.join(directory, 'test.sqlite'),
    projectRoot: directory, outputPath: path.join(directory, 'public-output'),
    origins: ['http://localhost:5173', 'http://127.0.0.1:4173'],
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    app.locals.db.close();
    // This exact path was returned by mkdtemp, never a configured owner path.
    await fs.rm(directory, { recursive: true, force: true });
  });
  const session = await fetch(`${base}/api/v1/session`);
  assert.equal(session.status, 200);
  const { token } = await session.json();
  assert.match(token, /^[a-f0-9]{64}$/);
  const request = (url, options = {}) => fetch(base + url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const json = (url, body, method = 'POST') => request(url, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const createGallery = async (name = 'Security fixture') => {
    const response = await json('/api/v1/galleries', { name });
    assert.equal(response.status, 201);
    return response.json();
  };
  return { app, directory, dataDir, base, token, request, json, createGallery };
}

function rawRequest(base, url, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(url, base), { method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function assertError(response, status, code) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(typeof body.error.message, 'string');
  if (code) assert.equal(body.error.code, code);
  assert.ok(!JSON.stringify(body).includes('at createApp'), 'stack trace must not leak');
}

test('owner API reads and writes require a valid process-scoped bearer token', async t => {
  const f = await fixture(t);
  const routes = [
    ['GET', '/api/v1/galleries'], ['GET', '/api/v1/galleries/missing/photos'],
    ['POST', '/api/v1/galleries'], ['PATCH', '/api/v1/galleries/missing'],
    ['POST', '/api/v1/photos'], ['POST', '/api/v1/metadata-inspections'],
    ['PATCH', '/api/v1/photos/missing'],
    ['POST', '/api/v1/galleries/missing/publication'], ['POST', '/api/v1/exports'],
  ];
  for (const [method, url] of routes) {
    await t.test(`${method} ${url} rejects missing credentials`, async () => {
      await assertError(await fetch(f.base + url, { method }), 401, 'UNAUTHORIZED');
    });
  }
  for (const authorization of ['Bearer invalid', `Bearer ${f.token}0`, 'Basic owner']) {
    await assertError(await fetch(f.base + '/api/v1/galleries', {
      headers: { Authorization: authorization },
    }), 401, 'UNAUTHORIZED');
  }
  const second = await fixture(t);
  assert.notEqual(f.token, second.token);
  await assertError(await second.request('/api/v1/galleries', {
    headers: { Authorization: `Bearer ${f.token}` },
  }), 401, 'UNAUTHORIZED');
  assert.equal((await f.request('/api/v1/galleries')).status, 200);
});

test('session and authenticated API reject rebinding and cross-site browser requests', async t => {
  const f = await fixture(t);
  const cases = [
    ['foreign Host', { Host: 'attacker.example' }],
    ['deceptive localhost suffix', { Host: 'localhost.attacker.example' }],
    ['deceptive IP suffix', { Host: '127.0.0.1.attacker.example' }],
    ['malformed Host', { Host: '[invalid' }],
    ['foreign Origin', { Origin: 'https://attacker.example' }],
    ['opaque Origin', { Origin: 'null' }],
    ['unconfigured loopback Origin', { Origin: 'http://localhost:9999' }],
    ['cross-site Fetch Metadata', { 'Sec-Fetch-Site': 'cross-site' }],
  ];
  for (const [name, headers] of cases) {
    await t.test(name, async () => {
      for (const url of ['/api/v1/session', '/api/v1/galleries']) {
        const response = await rawRequest(f.base, url, {
          Authorization: `Bearer ${f.token}`, ...headers,
        });
        assert.equal(response.status, 403);
        assert.equal(JSON.parse(response.body).error.code, 'FORBIDDEN');
        assert.ok(!response.body.includes(f.token));
        assert.notEqual(response.headers['access-control-allow-origin'], '*');
      }
    });
  }
  const port = new URL(f.base).port;
  const local = await rawRequest(f.base, '/api/v1/session', {
    Host: `localhost:${port}`, Origin: 'http://localhost:5173',
    'Sec-Fetch-Site': 'same-origin',
  });
  assert.equal(local.status, 200);
  assert.equal(local.headers['cache-control'], 'no-store');
  assert.equal(local.headers['x-content-type-options'], 'nosniff');
  assert.notEqual(local.headers['access-control-allow-origin'], '*');
  const preflight = await rawRequest(f.base, '/api/v1/galleries', {
    Origin: 'https://attacker.example', 'Access-Control-Request-Method': 'POST',
  }, 'OPTIONS');
  assert.equal(preflight.status, 403);
  assert.notEqual(preflight.headers['access-control-allow-origin'], '*');
});

test('gallery fields reject malformed values without inserting records', async t => {
  const f = await fixture(t);
  const cases = [
    ['missing name', {}], ['blank name', { name: '   ' }],
    ['non-string name', { name: { unsafe: true } }], ['long name', { name: 'x'.repeat(121) }],
    ['long description', { description: 'x'.repeat(2001) }],
    ['long sport', { sport: 'x'.repeat(101) }], ['long location', { location: 'x'.repeat(201) }],
    ['invalid color', { themeColor: 'red' }], ['invalid preset', { themePreset: 'untrusted' }],
    ['impossible date', { eventDate: '2026-02-30' }],
    ['non-date string', { eventDate: 'not a date' }], ['wrong date type', { eventDate: true }],
  ];
  for (const [name, fields] of cases) {
    await t.test(name, async () => {
      const input = name === 'missing name' ? fields : { name: 'Album', ...fields };
      await assertError(await f.json('/api/v1/galleries', input), 400);
    });
  }
  assert.equal(f.app.locals.db.prepare('SELECT COUNT(*) AS n FROM galleries').get().n, 0);
  const gallery = await f.createGallery();
  await assertError(await f.json(`/api/v1/galleries/${gallery.id}`, {
    coverPhotoId: 'not-in-this-album',
  }, 'PATCH'), 400);
  await assertError(await f.json(`/api/v1/galleries/${gallery.id}`, {
    eventDate: '2026-04-31',
  }, 'PATCH'), 400);
  const previous = f.app.locals.db.prepare('SELECT * FROM galleries WHERE id=?').get(gallery.id);
  assert.equal(previous.coverPhotoId, null);
  assert.equal(previous.eventDate, '');
});

test('invalid covers on album creation are not silently accepted', async t => {
  const f = await fixture(t);
  await assertError(await f.json('/api/v1/galleries', {
    name: 'Invalid cover', coverPhotoId: 'not-in-this-album',
  }), 400);
  assert.equal(f.app.locals.db.prepare('SELECT COUNT(*) AS n FROM galleries').get().n, 0);
});

test('actual image decoding rejects SVG and spoofed JPEG; rejected files are cleaned up', async t => {
  const f = await fixture(t);
  const gallery = await f.createGallery();
  const payloads = [
    ['SVG disguised as JPEG', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>', 'image/jpeg', 'photo.jpg'],
    ['unsupported SVG', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>', 'image/svg+xml', 'photo.svg'],
    ['text disguised as JPEG', 'This is not a JPEG image.', 'image/jpeg', 'photo.jpg'],
  ];
  for (const [name, contents, mimeType, filename] of payloads) {
    for (const route of ['/api/v1/photos', '/api/v1/metadata-inspections']) {
      await t.test(`${name}: ${route}`, async () => {
        const form = new FormData();
        form.append('galleryId', gallery.id);
        form.append('photo', new Blob([contents], { type: mimeType }), filename);
        await assertError(await f.request(route, { method: 'POST', body: form }), 422);
        for (const subdir of ['incoming', 'originals', 'previews', 'thumbnails']) {
          assert.deepEqual(await fs.readdir(path.join(f.dataDir, subdir)), []);
        }
        assert.equal(f.app.locals.db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, 0);
      });
    }
  }
});

test('media variant allowlist and storage boundary never expose arbitrary files', async t => {
  const f = await fixture(t);
  const gallery = await f.createGallery();
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const form = new FormData();
  form.append('galleryId', gallery.id);
  form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'fixture.jpg');
  const response = await f.request('/api/v1/photos', { method: 'POST', body: form });
  assert.equal(response.status, 201);
  const photo = await response.json();
  for (const variant of ['missing', '__proto__', 'constructor', 'toString', '%2e%2e%2fprivate.txt']) {
    await t.test(`unknown variant ${variant} is 404`, async () => {
      await assertError(await f.request(`/media/${photo.id}/${variant}`), 404, 'NOT_FOUND');
    });
  }
  await assertError(await f.request('/media/unknown/original'), 404, 'NOT_FOUND');
  const outside = path.join(f.directory, 'private.txt');
  await fs.writeFile(outside, 'PRIVATE_TEST_SENTINEL');
  f.app.locals.db.prepare('UPDATE photos SET filePath=? WHERE id=?').run(outside, photo.id);
  const blocked = await f.request(`/media/${photo.id}/original`);
  await assertError(blocked, 404, 'NOT_FOUND');
  const sibling = path.join(f.directory, 'data-other');
  await fs.mkdir(sibling);
  const siblingFile = path.join(sibling, 'private.txt');
  await fs.writeFile(siblingFile, 'PRIVATE_TEST_SENTINEL');
  f.app.locals.db.prepare('UPDATE photos SET filePath=? WHERE id=?').run(siblingFile, photo.id);
  await assertError(await f.request(`/media/${photo.id}/original`), 404, 'NOT_FOUND');
});

test('publication requires explicit public-original acknowledgement', async t => {
  const f = await fixture(t);
  const gallery = await f.createGallery();
  for (const fields of [{}, { acknowledgePublicOriginals: 'true' }, { acknowledgePublicOriginals: false }]) {
    await assertError(await f.json(`/api/v1/galleries/${gallery.id}/publication`, fields), 400);
  }
  assert.equal(f.app.locals.db.prepare('SELECT publishedAt FROM galleries WHERE id=?').get(gallery.id).publishedAt, null);
});

test('photo edits validate date and field lengths without changing the original', async t => {
  const f = await fixture(t);
  const gallery = await f.createGallery();
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const form = new FormData();
  form.append('galleryId', gallery.id);
  form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'fixture.jpg');
  const uploaded = await f.request('/api/v1/photos', { method: 'POST', body: form });
  assert.equal(uploaded.status, 201);
  const photo = await uploaded.json();
  for (const fields of [{ dateTaken: '2026-02-30' }, { sport: 'x'.repeat(101) }, { location: 'x'.repeat(201) }]) {
    await assertError(await f.json(`/api/v1/photos/${photo.id}`, fields, 'PATCH'), 400);
  }
  const original = await f.request(`/media/${photo.id}/original`);
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
});

test('multipart count and field-size bounds reject requests and clean staging', async t => {
  const f = await fixture(t);
  const gallery = await f.createGallery();
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  for (const route of ['/api/v1/photos', '/api/v1/metadata-inspections']) {
    const multiple = new FormData();
    multiple.append('galleryId', gallery.id);
    multiple.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'one.jpg');
    multiple.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'two.jpg');
    await assertError(await f.request(route, { method: 'POST', body: multiple }), 400);
    assert.deepEqual(await fs.readdir(path.join(f.dataDir, 'incoming')), []);
    const largeField = new FormData();
    largeField.append('galleryId', gallery.id);
    largeField.append('location', 'x'.repeat(4097));
    largeField.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'one.jpg');
    await assertError(await f.request(route, { method: 'POST', body: largeField }), 400);
    assert.deepEqual(await fs.readdir(path.join(f.dataDir, 'incoming')), []);
  }
  assert.equal(f.app.locals.db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, 0);
});

test('SQL-looking user text stays data and does not widen photo queries', async t => {
  const f = await fixture(t);
  const name = "Album'); DROP TABLE photos; --";
  const created = await f.json('/api/v1/galleries', { name });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).name, name);
  assert.equal(f.app.locals.db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, 0);
  await assertError(await f.request(`/api/v1/galleries/${encodeURIComponent("' OR 1=1 --")}/photos`), 404, 'NOT_FOUND');
});

test('public export excludes drafts, local paths, owner token and private database', async t => {
  const f = await fixture(t);
  const gallery = await f.createGallery('Published');
  const draftGallery = await f.createGallery('Private draft');
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const upload = async galleryId => {
    const form = new FormData();
    form.append('galleryId', galleryId);
    form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'fixture.jpg');
    const response = await f.request('/api/v1/photos', { method: 'POST', body: form });
    assert.equal(response.status, 201);
    return response.json();
  };
  const published = await upload(gallery.id);
  const publication = await f.json(`/api/v1/galleries/${gallery.id}/publication`, { acknowledgePublicOriginals: true });
  assert.equal(publication.status, 200);
  assert.ok((await fs.readdir(path.join(f.dataDir, 'backups'))).some(file => file.startsWith('published-')));
  const laterDraft = await upload(gallery.id);
  const privateDraft = await upload(draftGallery.id);
  const build = path.join(f.directory, 'frontend', 'dist-public');
  await fs.mkdir(build, { recursive: true });
  await fs.writeFile(path.join(build, 'build-info.json'), JSON.stringify({ staticSite: true }));
  await fs.writeFile(path.join(build, 'index.html'), '<!doctype html><title>Isolated export fixture</title>');
  const exported = await f.json('/api/v1/exports', {});
  assert.equal(exported.status, 200);
  const { outputPath } = await exported.json();
  const galleryText = await fs.readFile(path.join(outputPath, 'data', 'galleries.json'), 'utf8');
  const photoText = await fs.readFile(path.join(outputPath, 'data', 'albums', gallery.id + '.json'), 'utf8');
  assert.deepEqual(JSON.parse(photoText).map(photo => photo.id), [published.id]);
  assert.deepEqual(JSON.parse(galleryText).map(album => album.id), [gallery.id]);
  for (const forbidden of [laterDraft.id, privateDraft.id, f.token, f.dataDir, 'filePath', 'exifRaw', 'uploadKey']) {
    assert.ok(!galleryText.includes(forbidden));
    assert.ok(!photoText.includes(forbidden));
  }
  const files = await fs.readdir(outputPath, { recursive: true });
  assert.ok(!files.some(file => /\.(?:db|sqlite|sqlite3)(?:-wal|-shm)?$|(?:^|\/)\.env|(?:^|\/)backups(?:\/|$)/.test(file)));
  const originalUrl = JSON.parse(photoText)[0].originalUrl;
  assert.deepEqual(await fs.readFile(path.join(outputPath, originalUrl.slice(1))), bytes);
  // This is an exporter boundary test, not proof that a real Vite build or CDN
  // deployment contains no management code, and not an independent backup.
});
