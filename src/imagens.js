// Upload de imagens: o navegador redimensiona e envia em base64 (data URL) dentro do JSON.
// Assim não precisamos de biblioteca para multipart/form-data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ErroHttp } = require('./http');

const PASTA_UPLOADS = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(PASTA_UPLOADS, { recursive: true });

const TAMANHO_MAXIMO = 3 * 1024 * 1024; // 3 MB depois de decodificado

// Confere a "assinatura" dos primeiros bytes; não confia no tipo declarado pelo navegador.
function detectarTipo(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Salva uma data URL e devolve o caminho público (/uploads/arquivo.ext). */
function salvarImagemBase64(dataUrl) {
  const m = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new ErroHttp(400, 'Imagem em formato inválido.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > TAMANHO_MAXIMO) throw new ErroHttp(413, 'Imagem maior que 3 MB.');
  const ext = detectarTipo(buf);
  if (!ext) throw new ErroHttp(400, 'Use imagens JPG, PNG ou WebP.');
  const nome = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(PASTA_UPLOADS, nome), buf);
  return `/uploads/${nome}`;
}

/** Apaga o arquivo se a imagem for um upload local (URLs externas são ignoradas). */
function apagarImagemLocal(caminho) {
  if (!caminho || !caminho.startsWith('/uploads/')) return;
  const arquivo = path.join(PASTA_UPLOADS, path.basename(caminho));
  fs.rm(arquivo, { force: true }, () => {});
}

/** Aceita: data URL (novo upload), caminho /uploads/... já existente, URL http(s) ou vazio. */
function normalizarImagem(valor) {
  const v = String(valor || '').trim();
  if (!v) return '';
  if (v.startsWith('data:')) return salvarImagemBase64(v);
  if (/^\/uploads\/[\w.-]+$/.test(v)) return v;
  try {
    const url = new URL(v);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch { /* cai no erro abaixo */ }
  throw new ErroHttp(400, 'A URL da imagem deve começar com http:// ou https://');
}

module.exports = { PASTA_UPLOADS, normalizarImagem, apagarImagemLocal };
