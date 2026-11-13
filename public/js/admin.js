// Painel administrativo: login (Supabase Auth), navegação e "Minha conta".
import { auth, configurado, rest } from './supabase.js';
import { avisar, esc, icone } from './util.js';
import { fecharModal } from './admin-ui.js';
import { LOJA_PADRAO, aplicarCores, logoHtml } from './loja.js';
import { vistaProdutos } from './admin-produtos.js';
import { vistaOrganizacao } from './admin-organizacao.js';
import { vistaAparencia } from './admin-aparencia.js';

const $ = (id) => document.getElementById(id);
const vista = $('vista');

// ---------------------------------------------------------------- Entrada
async function iniciar() {
  document.querySelectorAll('[data-icone]').forEach((el) => { el.innerHTML = icone(el.dataset.icone); });

  if (!configurado) {
    return mostrarEntrada('aviso', 'Supabase não configurado',
      'Preencha o endereço e a chave pública do projeto em <code>js/config.js</code>. O passo a passo está no README.');
  }
  if (!auth.usuario()) return mostrarEntrada('login');
  try {
    await abrirPainel();
  } catch (erro) {
    if (erro.status === 401) return mostrarEntrada('login');
    mostrarEntrada('aviso', 'Não foi possível abrir o painel', esc(erro.message), true);
  }
}

function mostrarEntrada(tipo, titulo = '', mensagem = '', tentarDeNovo = false) {
  $('painel').hidden = true;
  $('tela-entrada').hidden = false;
  const conteudo = $('entrada-conteudo');

  if (tipo === 'aviso') {
    conteudo.innerHTML = `<h1>${esc(titulo)}</h1><p>${mensagem}</p>
      ${tentarDeNovo ? '<button class="btn btn-primario btn-bloco" id="de-novo">Tentar de novo</button>' : ''}`;
    $('de-novo')?.addEventListener('click', () => location.reload());
    return;
  }
  if (tipo === 'sem-acesso') {
    conteudo.innerHTML = `
      <h1>Sem acesso ao painel</h1>
      <p>A conta <strong>${esc(auth.usuario()?.email)}</strong> entrou, mas não está cadastrada como administradora desta loja.
      Peça para incluí-la na tabela <code>admins</code> do Supabase (veja o README).</p>
      <button class="btn btn-bloco" id="trocar-conta">Entrar com outra conta</button>`;
    $('trocar-conta').addEventListener('click', async () => { await auth.sair(); mostrarEntrada('login'); });
    return;
  }

  conteudo.innerHTML = `
    <h1>Entrar</h1>
    <p>Acesse com o e-mail e a senha da sua conta de administrador.</p>
    <form id="form-entrada" novalidate>
      <label class="campo"><span>E-mail</span><input class="input" name="email" type="email" autocomplete="username" required></label>
      <label class="campo"><span>Senha</span><input class="input" name="senha" type="password" autocomplete="current-password" required></label>
      <p class="erro-form" id="erro-entrada" role="alert"></p>
      <button class="btn btn-primario btn-bloco" type="submit">Entrar</button>
    </form>`;

  const form = $('form-entrada');
  form.email.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const botao = form.querySelector('button');
    if (!form.email.value.trim() || !form.senha.value) {
      $('erro-entrada').textContent = 'Preencha e-mail e senha.';
      return;
    }
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    $('erro-entrada').textContent = '';
    try {
      await auth.entrar(form.email.value.trim(), form.senha.value);
      await abrirPainel();
    } catch (erro) {
      $('erro-entrada').textContent = erro.message;
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });
}

// ---------------------------------------------------------------- Painel e rotas
const ROTAS = {
  produtos: { titulo: 'Produtos', render: vistaProdutos },
  organizacao: { titulo: 'Categorias e temas', render: vistaOrganizacao },
  aparencia: { titulo: 'Aparência da loja', render: (v) => vistaAparencia(v, { aoSalvar: mostrarLoja }) },
  conta: { titulo: 'Minha conta', render: vistaConta },
};

async function abrirPainel() {
  if (!(await auth.ehAdmin())) return mostrarEntrada('sem-acesso');
  $('tela-entrada').hidden = true;
  $('painel').hidden = false;
  $('usuario-email').textContent = auth.usuario().email;
  $('usuario-email').title = auth.usuario().email;

  $('sair').onclick = async () => {
    await auth.sair();
    location.hash = '';
    mostrarEntrada('login');
  };
  $('abrir-menu').onclick = () => alternarMenu(true);
  $('veu-menu').onclick = () => alternarMenu(false);
  window.onhashchange = navegar;

  rest('loja?select=*&id=eq.1').then((l) => mostrarLoja({ ...LOJA_PADRAO, ...l[0] })).catch(() => {});
  await navegar();
}

/** Mostra nome, logo e cor da loja no menu do painel. */
function mostrarLoja(loja) {
  aplicarCores(loja.cor_primaria);
  $('nome-loja-painel').textContent = loja.nome;
  $('logo-painel').innerHTML = logoHtml(loja);
}

function alternarMenu(abrir) {
  $('menu').classList.toggle('aberto', abrir);
  $('veu-menu').classList.toggle('aberto', abrir);
  $('abrir-menu').setAttribute('aria-expanded', abrir);
}

async function navegar() {
  const nome = location.hash.replace(/^#\/?/, '') || 'produtos';
  const rota = ROTAS[nome] || ROTAS.produtos;
  document.querySelectorAll('[data-rota]').forEach((a) => {
    const ativo = a.dataset.rota === nome || (!ROTAS[nome] && a.dataset.rota === 'produtos');
    a.classList.toggle('ativo', ativo);
    if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('titulo-mobile').textContent = rota.titulo;
  document.title = `${rota.titulo} · Painel`;
  alternarMenu(false);
  fecharModal();
  vista.innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    await rota.render(vista);
  } catch (erro) {
    if (erro.status === 401) return mostrarEntrada('login');
    vista.innerHTML = `<div class="vazio"><strong>Erro</strong>${esc(erro.message)}</div>`;
  }
}

// Sessão expirou no meio do uso: volta para o login.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.status === 401) { e.preventDefault(); mostrarEntrada('login'); }
});

// ---------------------------------------------------------------- Minha conta
function vistaConta(v) {
  v.innerHTML = `
    <div class="cabecalho"><div><h1>Minha conta</h1><p>Conta de acesso ao painel (Supabase Auth).</p></div></div>
    <div class="secoes-config">
      <form class="secao" id="form-senha" novalidate>
        <h2>Alterar senha</h2>
        <p>Conta: <strong>${esc(auth.usuario().email)}</strong></p>
        <input type="text" name="usuario" autocomplete="username" value="${esc(auth.usuario().email)}" hidden>
        <label class="campo"><span>Nova senha</span>
          <input class="input" name="nova" type="password" autocomplete="new-password" minlength="8" required>
          <small>Mínimo de 8 caracteres.</small>
        </label>
        <label class="campo"><span>Repita a nova senha</span>
          <input class="input" name="repetida" type="password" autocomplete="new-password" required>
        </label>
        <div class="acoes"><button class="btn btn-primario" type="submit">Alterar senha</button></div>
      </form>
    </div>`;

  const form = v.querySelector('#form-senha');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { nova, repetida } = Object.fromEntries(new FormData(form));
    if (nova.length < 8) return avisar('A nova senha precisa ter pelo menos 8 caracteres.', 'erro');
    if (nova !== repetida) return avisar('As duas senhas não são iguais.', 'erro');
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      await auth.trocarSenha(nova);
      form.reset();
      avisar('Senha alterada.');
    } catch (erro) {
      avisar(erro.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  });
}

iniciar();
