// Tiny static HTTP server for the Ultraman game prototype.
// Run:  node serve.js   then open http://localhost:8000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // API: list available .glb model files in assets/
  if (urlPath === '/api/models') {
    try {
      const files = fs.readdirSync(path.join(ROOT, 'assets'))
        .filter(f => f.toLowerCase().endsWith('.glb'))
        .map(f => './assets/' + f);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(files));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('assets dir read failed: ' + err.message);
    }
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
    } else {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
}).listen(PORT, () => {
  console.log(`\n  ULTRAMAN game serving at  http://localhost:${PORT}/\n`);
});
