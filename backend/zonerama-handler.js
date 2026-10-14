const { Readable } = require('node:stream');
const handler = import('../shared/zonerama.mjs').then(module => module.createZoneramaHandler());
async function serveZonerama(req, res) {
  const response = await (await handler)(new Request('http://localhost' + (req.originalUrl || req.url), { method: req.method }));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return res.end();
  const stream = Readable.fromWeb(response.body);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
module.exports = { serveZonerama };
