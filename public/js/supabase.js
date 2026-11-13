// Comunicação com o Supabase (Auth, API REST e Storage) usando só fetch — sem biblioteca.
import { CONFIG } from './config.js';

export const URL_BASE = String(CONFIG.supabaseUrl || '').replace(/\/+$/, '');
const CHAVE = String(CONFIG.supabaseKey || '');
export const configurado = /^https?:\/\//.test(URL_BASE) && !URL_BASE.includes('SEU-PROJETO')
  && CHAVE !== '' && !CHAVE.includes('SUA_CHAVE');

export const BUCKET = 'imagens';
const PREFIXO_PUBLICO = `${URL_BASE}/storage/v1/object/public/${BUCKET}/`;
const CHAVE_SESSAO = 'wpv_sessao';

class ErroSupabase extends Error {
  constructor(mensagem, status, codigo) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

function exigirConfiguracao() {
  if (!configurado) throw new ErroSupabase('Supabase não configurado. Preencha o arquivo js/config.js.', 0);
}

async function chamar(url, opcoes) {
  try {
    return await fetch(url, opcoes);
  } catch {
    throw new ErroSupabase('Sem conexão com o servidor. Verifique a internet.', 0);
  }
}

async function lerResposta(resposta) {
  const texto = await resposta.text();
  try { return texto ? JSON.parse(texto) : null; } catch { return null; }
}

// ---------------------------------------------------------------- Sessão do admin
let sessao = (() => {
  try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)) || null; } catch { return null; }
})();

function gravarSessao(nova) {
  sessao = nova;
  try {
    if (nova) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(nova));
    else localStorage.removeItem(CHAVE_SESSAO);
  } catch { /* sem armazenamento: a sessão dura só esta página */ }
}

const sessaoDaResposta = (d) => ({
  access_token: d.access_token,
  refresh_token: d.refresh_token,
  expira_em: Date.now() + (d.expires_in || 3600) * 1000,
  usuario: { id: d.user.id, email: d.user.email },
});

function traduzirErroAuth(d) {
  const codigo = d?.error_code || d?.code;
  if (codigo === 'invalid_credentials') return 'E-mail ou senha incorretos.';
  if (codigo === 'email_not_confirmed') return 'E-mail ainda não confirmado. Confirme o usuário no painel do Supabase.';
  if (codigo === 'user_banned') return 'Este usuário está bloqueado.';
  if (codigo === 'over_request_rate_limit' || codigo === 'over_email_send_rate_limit') return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  if (codigo === 'weak_password') return 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.';
  if (codigo === 'same_password') return 'A nova senha precisa ser diferente da atual.';
  return d?.msg || d?.message || d?.error_description || 'Não foi possível concluir. Tente de novo.';
}

async function chamarAuth(caminho, { metodo = 'POST', corpo, token } = {}) {
  exigirConfiguracao();
  const headers = { apikey: CHAVE, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resposta = await chamar(`${URL_BASE}/auth/v1/${caminho}`, {
    method: metodo, headers, body: JSON.stringify(corpo || {}),
  });
  const dados = await lerResposta(resposta);
  if (!resposta.ok) throw new ErroSupabase(traduzirErroAuth(dados), resposta.status, dados?.error_code);
  return dados;
}

// O token de acesso do Supabase vale ~1 hora; é renovado pouco antes de vencer.
let renovando = null;
function renovarSessao() {
  if (!renovando) {
    renovando = chamarAuth('token?grant_type=refresh_token', { corpo: { refresh_token: sessao?.refresh_token } })
      .then((d) => gravarSessao(sessaoDaResposta(d)))
      .catch((erro) => {
        if (erro.status >= 400 && erro.status < 500) {
          gravarSessao(null);
          throw new ErroSupabase('Sua sessão expirou. Entre de novo.', 401);
        }
        throw erro; // sem internet: mantém a sessão para tentar depois
      })
      .finally(() => { renovando = null; });
  }
  return renovando;
}

async function tokenDoAdmin() {
  if (!sessao) throw new ErroSupabase('Entre para continuar.', 401);
  if (Date.now() > sessao.expira_em - 60_000) await renovarSessao();
  return sessao.access_token;
}

export const auth = {
  usuario: () => sessao?.usuario || null,

  async entrar(email, senha) {
    const dados = await chamarAuth('token?grant_type=password', { corpo: { email, password: senha } });
    gravarSessao(sessaoDaResposta(dados));
    return sessao.usuario;
  },

  async sair() {
    const atual = sessao;
    gravarSessao(null);
    if (atual) await chamarAuth('logout', { token: atual.access_token }).catch(() => {});
  },

  /** A conta logada está na tabela public.admins? */
  async ehAdmin() {
    const linhas = await rest(`admins?select=user_id&user_id=eq.${encodeURIComponent(sessao.usuario.id)}`, { admin: true });
    return linhas.length > 0;
  },

  async trocarSenha(nova) {
    await chamarAuth('user', { metodo: 'PUT', corpo: { password: nova }, token: await tokenDoAdmin() });
  },
};

// ---------------------------------------------------------------- API REST
function traduzirErroRest(d, status) {
  const codigo = d?.code;
  if (codigo === '23505') {
    if (/codigo_barras/.test(d.message + d.details)) return 'Já existe um produto com esse código de barras.';
    return 'Já existe um cadastro com esse nome.';
  }
  if (codigo === '23503') return 'Este cadastro está em uso e não pode ser excluído.';
  if (codigo === '23514') return 'Algum valor está fora do permitido. Confira os campos.';
  if (codigo === '42501' || status === 403) return 'Sua conta não tem permissão para isso.';
  if (codigo === 'PGRST205' || codigo === '42P01') return 'Tabelas não encontradas. Rode o arquivo supabase/schema.sql no Supabase.';
  return d?.message || `Erro inesperado (${status}).`;
}

/**
 * Chamada à API REST (PostgREST).
 * admin: true usa o token do admin logado; senão acessa como visitante.
 */
export async function rest(caminho, { metodo = 'GET', corpo, prefer, admin = false, mensagens = {} } = {}, jaRenovou = false) {
  exigirConfiguracao();
  const headers = { apikey: CHAVE };
  if (admin) headers.Authorization = `Bearer ${await tokenDoAdmin()}`;
  else if (CHAVE.startsWith('eyJ')) headers.Authorization = `Bearer ${CHAVE}`; // chave "anon" antiga (JWT)
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const resposta = await chamar(`${URL_BASE}/rest/v1/${caminho}`, {
    method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await lerResposta(resposta);

  // Token recusado (ex.: relógio do aparelho adiantado): renova uma vez e repete.
  if (admin && resposta.status === 401 && !jaRenovou) {
    await renovarSessao();
    return rest(caminho, { metodo, corpo, prefer, admin, mensagens }, true);
  }
  if (!resposta.ok) {
    const msg = mensagens[dados?.code] || traduzirErroRest(dados, resposta.status);
    throw new ErroSupabase(msg, resposta.status, dados?.code);
  }
  return dados;
}

// ---------------------------------------------------------------- Storage (imagens)
const ehImagemNossa = (url) => configurado && typeof url === 'string' && url.startsWith(PREFIXO_PUBLICO);

export const storage = {
  /** Envia um Blob e devolve a URL pública. pasta: "produtos" ou "loja". */
  async enviar(blob, pasta) {
    exigirConfiguracao();
    const ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[blob.type];
    if (!ext) throw new ErroSupabase('Use imagens JPG, PNG ou WebP.', 400);
    const aleatorio = crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12);
    const caminho = `${pasta}/${Date.now()}-${aleatorio}.${ext}`;
    const resposta = await chamar(`${URL_BASE}/storage/v1/object/${BUCKET}/${caminho}`, {
      method: 'POST',
      headers: {
        apikey: CHAVE, Authorization: `Bearer ${await tokenDoAdmin()}`,
        'Content-Type': blob.type, 'Cache-Control': '31536000', 'x-upsert': 'false',
      },
      body: blob,
    });
    if (!resposta.ok) {
      const d = await lerResposta(resposta);
      const tamanho = /size|large/i.test(d?.message || d?.error || '');
      throw new ErroSupabase(tamanho ? 'Imagem maior que 3 MB.' : `Não foi possível enviar a imagem (${d?.message || resposta.status}).`, resposta.status);
    }
    return PREFIXO_PUBLICO + caminho;
  },

  /** Apaga uma imagem do bucket (URLs externas são ignoradas). Falhas não interrompem o fluxo. */
  async apagar(url) {
    if (!ehImagemNossa(url)) return;
    const caminho = url.slice(PREFIXO_PUBLICO.length);
    try {
      await chamar(`${URL_BASE}/storage/v1/object/${BUCKET}/${caminho}`, {
        method: 'DELETE',
        headers: { apikey: CHAVE, Authorization: `Bearer ${await tokenDoAdmin()}` },
      });
    } catch { /* a imagem fica órfã no bucket; não atrapalha o uso */ }
  },

  ehImagemNossa,
};
