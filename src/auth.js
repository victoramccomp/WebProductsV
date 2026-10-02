// Autenticação do painel: senhas com scrypt e sessões em cookie HttpOnly.
const crypto = require('node:crypto');
const { db } = require('./db');
const { ErroHttp, lerCookies } = require('./http');

const COOKIE = 'wpv_sessao';
const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function gerarHashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function conferirSenha(senha, guardado) {
  const [, salHex, hashHex] = String(guardado).split('$');
  if (!salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = crypto.scryptSync(senha, Buffer.from(salHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

// O banco guarda só o hash do token: quem ler o arquivo .db não consegue se passar pelo admin.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function criarSessao(res, usuarioId, requisicaoSegura) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(Date.now());
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)')
    .run(hashToken(token), usuarioId, Date.now() + DURACAO_SESSAO_MS);
  const atributos = [
    `${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict',
    `Max-Age=${DURACAO_SESSAO_MS / 1000}`,
  ];
  if (requisicaoSegura) atributos.push('Secure');
  res.setHeader('Set-Cookie', atributos.join('; '));
}

function encerrarSessao(req, res) {
  const token = lerCookies(req)[COOKIE];
  if (token) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function usuarioDaSessao(req) {
  const token = lerCookies(req)[COOKIE];
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.nome, u.email FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.expira_em > ?
  `).get(hashToken(token), Date.now()) || null;
}

/** Middleware: bloqueia a rota se não houver admin logado. */
function exigirLogin(req) {
  const usuario = usuarioDaSessao(req);
  if (!usuario) throw new ErroHttp(401, 'Faça login para continuar.');
  req.usuario = usuario;
}

// Limite simples de tentativas de login por IP (5 erros = espera 15 min).
const tentativas = new Map();
function verificarLimiteLogin(ip) {
  const t = tentativas.get(ip);
  if (t && t.bloqueadoAte > Date.now()) {
    const min = Math.ceil((t.bloqueadoAte - Date.now()) / 60000);
    throw new ErroHttp(429, `Muitas tentativas. Tente de novo em ${min} min.`);
  }
}
function registrarFalhaLogin(ip) {
  const t = tentativas.get(ip) || { erros: 0, bloqueadoAte: 0 };
  t.erros += 1;
  if (t.erros >= 5) {
    t.erros = 0;
    t.bloqueadoAte = Date.now() + 15 * 60 * 1000;
  }
  tentativas.set(ip, t);
}
const limparFalhasLogin = (ip) => tentativas.delete(ip);

module.exports = {
  gerarHashSenha, conferirSenha, criarSessao, encerrarSessao, usuarioDaSessao, exigirLogin,
  verificarLimiteLogin, registrarFalhaLogin, limparFalhasLogin,
};
