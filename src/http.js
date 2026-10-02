// Utilitários HTTP: roteador mínimo, leitura de JSON, respostas e cookies.

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/** Roteador com parâmetros no caminho: router.get('/api/produtos/:id', handler) */
function criarRouter() {
  const rotas = [];
  const add = (metodo) => (caminho, ...handlers) => {
    const nomes = [];
    const regex = new RegExp('^' + caminho.replace(/:(\w+)/g, (_, nome) => {
      nomes.push(nome);
      return '([^/]+)';
    }) + '/?$');
    rotas.push({ metodo, regex, nomes, handlers });
  };

  return {
    get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'),
    /** Retorna true se alguma rota atendeu a requisição. */
    async tratar(req, res, url) {
      for (const rota of rotas) {
        if (rota.metodo !== req.method) continue;
        const m = url.pathname.match(rota.regex);
        if (!m) continue;
        try {
          req.params = Object.fromEntries(rota.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        } catch {
          throw new ErroHttp(400, 'Endereço inválido.');
        }
        req.query = url.searchParams;
        for (const handler of rota.handlers) {
          await handler(req, res);
          if (res.writableEnded) break;
        }
        return true;
      }
      return false;
    },
  };
}

const LIMITE_CORPO = 8 * 1024 * 1024; // 8 MB (imagens chegam em base64)

function lerJson(req) {
  return new Promise((resolve, reject) => {
    const tipo = req.headers['content-type'] || '';
    // Exigir JSON também protege contra CSRF: formulários de outros sites não enviam JSON.
    if (!tipo.includes('application/json')) {
      return reject(new ErroHttp(415, 'Envie os dados como JSON.'));
    }
    let tamanho = 0;
    const partes = [];
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > LIMITE_CORPO) {
        reject(new ErroHttp(413, 'Requisição muito grande.'));
        req.destroy();
      } else {
        partes.push(parte);
      }
    });
    req.on('end', () => {
      try {
        resolve(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {});
      } catch {
        reject(new ErroHttp(400, 'JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function enviarJson(res, status, dados, cabecalhos = {}) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...cabecalhos,
  });
  res.end(corpo);
}

function lerCookies(req) {
  const cookies = {};
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i <= 0) continue;
    try { cookies[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim()); } catch { /* cookie malformado */ }
  }
  return cookies;
}

/** IP do cliente. Atrás de um proxy (Caddy/Nginx), defina TRUST_PROXY=1 para ler o X-Forwarded-For. */
function ipDoCliente(req) {
  if (process.env.TRUST_PROXY) {
    const encaminhado = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (encaminhado) return encaminhado;
  }
  return req.socket.remoteAddress;
}

module.exports = { ErroHttp, criarRouter, lerJson, enviarJson, lerCookies, ipDoCliente };
