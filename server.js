// WebProductsV — Catálogo de produtos com pedidos manuais.
// Sem dependências: usa só módulos nativos do Node 22.13+ (recomendado Node 24).
// Rodar:  node server.js        (porta padrão 5630, ou defina PORT)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { criarRouter, enviarJson, ErroHttp } = require('./src/http');
const { registrarRotasPublicas } = require('./src/rotas-publicas');
const { registrarRotasAdmin } = require('./src/rotas-admin');
const { PASTA_UPLOADS } = require('./src/imagens');

const PORTA = Number(process.env.PORT) || 5630;
const HOST = process.env.HOST || '0.0.0.0';
const PASTA_PUBLICA = path.join(__dirname, 'public');

const router = criarRouter();
registrarRotasPublicas(router);
registrarRotasAdmin(router);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

/** Serve um arquivo de dentro de `raiz`, bloqueando tentativas de sair da pasta (../). */
function servirArquivo(res, raiz, caminhoUrl, cacheLongo) {
  let relativo;
  try { relativo = decodeURIComponent(caminhoUrl); } catch { return false; }
  if (relativo.endsWith('/')) relativo += 'index.html';
  const arquivo = path.resolve(raiz, '.' + relativo);
  if (!arquivo.startsWith(raiz + path.sep)) return false;

  let stat;
  try { stat = fs.statSync(arquivo); } catch { return false; }
  if (stat.isDirectory()) {
    res.writeHead(301, { Location: caminhoUrl + '/' });
    res.end();
    return true;
  }
  res.writeHead(200, {
    'Content-Type': TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': cacheLongo ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(arquivo).pipe(res);
  return true;
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  req.seguro = !!req.socket.encrypted || (!!process.env.TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');

  try {
    if (url.pathname.startsWith('/api/')) {
      if (!(await router.tratar(req, res, url))) throw new ErroHttp(404, 'Rota não encontrada.');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new ErroHttp(405, 'Método não permitido.');

    // Uploads têm nome único, então podem ficar em cache "para sempre".
    if (url.pathname.startsWith('/uploads/')) {
      if (servirArquivo(res, PASTA_UPLOADS, url.pathname.slice('/uploads'.length), true)) return;
    } else if (servirArquivo(res, PASTA_PUBLICA, url.pathname, false)) {
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Página não encontrada.');
  } catch (erro) {
    const status = erro.status || 500;
    if (status === 500) console.error(erro);
    if (res.headersSent) return res.end();
    enviarJson(res, status, {
      erro: status === 500 ? 'Erro interno no servidor.' : erro.message,
      ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
    });
  }
});

servidor.listen(PORTA, HOST, () => {
  console.log(`\n  WebProductsV rodando!`);
  console.log(`  Catálogo: http://localhost:${PORTA}/`);
  console.log(`  Painel:   http://localhost:${PORTA}/admin/\n`);
});
