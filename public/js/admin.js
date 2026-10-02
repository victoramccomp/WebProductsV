// Painel administrativo: login, navegação e as seções Pedidos, Categorias e Configurações.
import { api, avisar, esc, formatarReais, icone, telefoneWhatsApp, mascararTelefone } from './util.js';
import {
  abrirModal, fecharModal, confirmar, pedirTexto, formatarData, STATUS, seloStatus,
} from './admin-ui.js';
import { vistaProdutos } from './admin-produtos.js';

const $ = (id) => document.getElementById(id);
const vista = $('vista');

// ---------------------------------------------------------------- Entrada
async function iniciar() {
  document.querySelectorAll('[data-icone]').forEach((el) => { el.innerHTML = icone(el.dataset.icone); });
  $('icone-entrada').innerHTML = icone('loja');
  $('icone-painel').innerHTML = icone('loja');

  let estado;
  try {
    estado = await api('/api/auth/estado');
  } catch (erro) {
    mostrarEntrada('erro', erro.message);
    return;
  }
  if (estado.usuario) return abrirPainel(estado.usuario);
  mostrarEntrada(estado.configurado ? 'login' : 'primeiro-acesso');
}

function mostrarEntrada(tipo, mensagem = '') {
  $('painel').hidden = true;
  $('tela-entrada').hidden = false;
  const conteudo = $('entrada-conteudo');

  if (tipo === 'erro') {
    conteudo.innerHTML = `<h1>Sem conexão</h1><p>${esc(mensagem)}</p><button class="btn btn-primario btn-bloco" onclick="location.reload()">Tentar de novo</button>`;
    return;
  }
  const primeiro = tipo === 'primeiro-acesso';
  conteudo.innerHTML = `
    <h1>${primeiro ? 'Primeiro acesso' : 'Entrar'}</h1>
    <p>${primeiro ? 'Crie a conta do administrador da loja. Esta tela só aparece uma vez.' : 'Acesse com seu e-mail e senha.'}</p>
    <form id="form-entrada" novalidate>
      ${primeiro ? `<label class="campo"><span>Seu nome</span><input class="input" name="nome" autocomplete="name" required></label>` : ''}
      <label class="campo"><span>E-mail</span><input class="input" name="email" type="email" autocomplete="${primeiro ? 'email' : 'username'}" required></label>
      <label class="campo"><span>Senha</span>
        <input class="input" name="senha" type="password" autocomplete="${primeiro ? 'new-password' : 'current-password'}" required minlength="${primeiro ? 8 : 1}">
        ${primeiro ? '<small>Mínimo de 8 caracteres.</small>' : ''}
      </label>
      <p class="erro-form" id="erro-entrada" role="alert"></p>
      <button class="btn btn-primario btn-bloco" type="submit">${primeiro ? 'Criar conta e entrar' : 'Entrar'}</button>
    </form>`;

  const form = $('form-entrada');
  form.querySelector('input').focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(form));
    const botao = form.querySelector('button');
    botao.disabled = true;
    $('erro-entrada').textContent = '';
    try {
      await api(primeiro ? '/api/auth/primeiro-acesso' : '/api/auth/login', { metodo: 'POST', corpo: dados });
      const { usuario } = await api('/api/auth/estado');
      abrirPainel(usuario);
    } catch (erro) {
      $('erro-entrada').textContent = erro.message;
      botao.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- Painel e rotas
const ROTAS = {
  produtos: { titulo: 'Produtos', render: (v) => vistaProdutos(v, { atualizarResumo }) },
  pedidos: { titulo: 'Pedidos', render: vistaPedidos },
  categorias: { titulo: 'Categorias', render: vistaCategorias },
  configuracoes: { titulo: 'Configurações', render: vistaConfiguracoes },
};

async function abrirPainel(usuario) {
  $('tela-entrada').hidden = true;
  $('painel').hidden = false;
  $('usuario-nome').textContent = usuario.nome;
  $('usuario-nome').title = usuario.email;

  $('sair').onclick = async () => {
    await api('/api/auth/logout', { metodo: 'POST' }).catch(() => {});
    location.hash = '';
    mostrarEntrada('login');
  };
  $('abrir-menu').onclick = () => alternarMenu(true);
  $('veu-menu').onclick = () => alternarMenu(false);

  window.onhashchange = navegar;
  const loja = await api('/api/loja').catch(() => ({}));
  $('nome-loja-painel').textContent = loja.nome || 'Minha Loja';
  api('/api/admin/resumo').then(atualizarResumo).catch(() => {});
  navegar();
}

function alternarMenu(abrir) {
  $('menu').classList.toggle('aberto', abrir);
  $('veu-menu').classList.toggle('aberto', abrir);
  $('abrir-menu').setAttribute('aria-expanded', abrir);
}

function atualizarResumo(resumo) {
  const badge = $('badge-pedidos');
  badge.hidden = !resumo.pedidos_pendentes;
  badge.textContent = resumo.pedidos_pendentes;
  badge.title = `${resumo.pedidos_pendentes} pedido(s) pendente(s)`;
}

async function navegar() {
  const nome = location.hash.replace(/^#\/?/, '') || 'produtos';
  const rota = ROTAS[nome] || ROTAS.produtos;
  document.querySelectorAll('[data-rota]').forEach((a) => {
    const ativo = a.dataset.rota === nome;
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

// ---------------------------------------------------------------- Pedidos
let filtroPedidos = '';

async function vistaPedidos(v) {
  const { pedidos, contagem } = await api(`/api/admin/pedidos${filtroPedidos ? `?status=${filtroPedidos}` : ''}`);
  const total = Object.values(contagem).reduce((s, n) => s + n, 0);
  atualizarResumo({ pedidos_pendentes: contagem.pendente });

  v.innerHTML = `
    <div class="cabecalho">
      <div><h1>Pedidos</h1><p>Pedidos enviados pelos clientes pelo catálogo.</p></div>
      <button class="btn" id="atualizar-pedidos">Atualizar</button>
    </div>
    <div class="abas" role="group" aria-label="Filtrar por status">
      <button class="aba" data-status="" aria-pressed="${!filtroPedidos}">Todos <span class="n">${total}</span></button>
      ${Object.entries(STATUS).map(([chave, s]) =>
        `<button class="aba" data-status="${chave}" aria-pressed="${filtroPedidos === chave}">${s.nome} <span class="n">${contagem[chave]}</span></button>`).join('')}
    </div>
    <div class="tabela-caixa">
      ${pedidos.length ? `
      <table class="tabela">
        <thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th class="num">Itens</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody>
          ${pedidos.map((p) => `
            <tr class="clicavel" data-id="${p.id}" tabindex="0">
              <td class="mono">${esc(p.codigo)}</td>
              <td>${formatarData(p.criado_em)}</td>
              <td><strong>${esc(p.cliente_nome)}</strong><span class="sub">${esc(p.cliente_telefone)}</span></td>
              <td class="num">${p.total_itens}</td>
              <td class="num">${formatarReais(p.total_centavos)}</td>
              <td>${seloStatus(p.status)}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : `<div class="vazio"><strong>Nenhum pedido ${filtroPedidos ? `“${esc(STATUS[filtroPedidos].nome.toLowerCase())}”` : 'ainda'}</strong>Os pedidos feitos no catálogo aparecem aqui.</div>`}
    </div>`;

  v.querySelector('#atualizar-pedidos').addEventListener('click', () => vistaPedidos(v));
  v.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
    filtroPedidos = b.dataset.status;
    vistaPedidos(v);
  }));
  v.querySelectorAll('tr[data-id]').forEach((tr) => {
    const abrir = () => abrirPedido(Number(tr.dataset.id), () => vistaPedidos(v));
    tr.addEventListener('click', abrir);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
  });
}

async function abrirPedido(id, depois) {
  let pedido;
  try { pedido = await api(`/api/admin/pedidos/${id}`); } catch (erro) { return avisar(erro.message, 'erro'); }
  const wa = telefoneWhatsApp(pedido.cliente_telefone);
  const msgCliente = `Olá, ${pedido.cliente_nome.split(' ')[0]}! Sobre o seu pedido ${pedido.codigo}: `;

  const m = abrirModal({
    titulo: `Pedido ${pedido.codigo}`,
    corpo: `
      <dl class="pedido-cabecalho">
        <div><dt>Cliente</dt><dd>${esc(pedido.cliente_nome)}</dd></div>
        <div><dt>Telefone / WhatsApp</dt><dd>${esc(pedido.cliente_telefone)}</dd></div>
        <div><dt>E-mail</dt><dd>${pedido.cliente_email ? `<a href="mailto:${esc(pedido.cliente_email)}">${esc(pedido.cliente_email)}</a>` : '—'}</dd></div>
        <div><dt>Recebido em</dt><dd>${formatarData(pedido.criado_em)}</dd></div>
        <div><dt>Status</dt><dd>${seloStatus(pedido.status)}</dd></div>
        <div><dt>Total</dt><dd><strong>${formatarReais(pedido.total_centavos)}</strong></dd></div>
      </dl>
      ${pedido.observacoes ? `<div class="observacoes"><strong>Observações:</strong> ${esc(pedido.observacoes)}</div>` : ''}
      <div class="tabela-caixa">
        <table class="tabela">
          <thead><tr><th>Produto</th><th>Código</th><th class="num">Qtd.</th><th class="num">Preço un.</th><th class="num">Subtotal</th><th class="num">Estoque atual</th></tr></thead>
          <tbody>
            ${pedido.itens.map((i) => `
              <tr>
                <td><strong>${esc(i.nome_produto)}</strong><span class="sub">${esc(i.conteudo)}</span></td>
                <td class="mono">${esc(i.codigo_barras || '—')}</td>
                <td class="num">${i.quantidade}</td>
                <td class="num">${formatarReais(i.preco_unit_centavos)}</td>
                <td class="num">${formatarReais(i.subtotal_centavos)}</td>
                <td class="num ${i.produto_id === null ? '' : i.estoque_atual < i.quantidade && pedido.status !== 'aprovado' ? 'estoque-zero' : ''}">${i.produto_id === null ? '<span class="sub">excluído</span>' : i.estoque_atual}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <form class="pedido-status" id="form-status">
        <label class="campo"><span>Alterar status</span>
          <select class="select" name="status">
            ${Object.entries(STATUS).map(([chave, s]) => `<option value="${chave}" ${chave === pedido.status ? 'selected' : ''}>${s.nome}</option>`).join('')}
          </select>
          <small>Aprovar dá baixa no estoque. Tirar de “Aprovado” devolve as quantidades.</small>
        </label>
        <button class="btn btn-primario" type="submit">Salvar status</button>
      </form>`,
    rodape: `
      ${wa ? `<a class="btn btn-whatsapp esquerda" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(msgCliente)}">${icone('whatsapp')} Falar com o cliente</a>` : ''}
      <button class="btn" type="button" data-fechar>Fechar</button>`,
  });

  m.querySelector('#form-status').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = e.target.status.value;
    if (status === pedido.status) return fecharModal();
    try {
      await api(`/api/admin/pedidos/${id}`, { metodo: 'PATCH', corpo: { status } });
      avisar(`Pedido marcado como “${STATUS[status].nome}”.`);
      fecharModal();
      depois();
    } catch (erro) { avisar(erro.message, 'erro'); }
  });
}

// ---------------------------------------------------------------- Categorias
async function vistaCategorias(v) {
  const categorias = await api('/api/admin/categorias');
  v.innerHTML = `
    <div class="cabecalho">
      <div><h1>Categorias</h1><p>Organize o menu lateral do catálogo em categorias e subcategorias.</p></div>
    </div>
    <form class="nova-categoria" id="form-nova-categoria">
      <label class="sr-only" for="nome-nova-categoria">Nova categoria</label>
      <input class="input" id="nome-nova-categoria" placeholder="Nome da nova categoria" maxlength="60" required>
      <button class="btn btn-primario" type="submit">${icone('mais')} Adicionar</button>
    </form>
    <div class="lista-categorias">
      ${categorias.map((c) => `
        <section class="cartao-categoria" data-id="${c.id}">
          <header>
            <h2>${esc(c.nome)}<span class="contagem">${c.total} produto(s)</span></h2>
            <button class="btn btn-fantasma btn-icone" data-acao="renomear-cat" aria-label="Renomear ${esc(c.nome)}">${icone('editar')}</button>
            <button class="btn btn-fantasma btn-icone btn-perigo" data-acao="excluir-cat" aria-label="Excluir ${esc(c.nome)}">${icone('lixo')}</button>
          </header>
          <ul class="subs">
            ${c.subcategorias.map((s) => `
              <li data-sub="${s.id}">
                <span>${esc(s.nome)}</span><small>${s.total}</small>
                <button class="btn btn-fantasma btn-icone btn-pequeno" data-acao="renomear-sub" aria-label="Renomear ${esc(s.nome)}">${icone('editar')}</button>
                <button class="btn btn-fantasma btn-icone btn-pequeno btn-perigo" data-acao="excluir-sub" aria-label="Excluir ${esc(s.nome)}">${icone('lixo')}</button>
              </li>`).join('') || '<li><span class="sub" style="color:var(--texto-3)">Sem subcategorias</span></li>'}
          </ul>
          <form class="add-sub" data-acao="nova-sub">
            <input class="input" placeholder="Nova subcategoria" maxlength="60" aria-label="Nova subcategoria em ${esc(c.nome)}" required>
            <button class="btn btn-pequeno" type="submit">Adicionar</button>
          </form>
        </section>`).join('') || '<div class="vazio"><strong>Nenhuma categoria</strong>Crie a primeira acima.</div>'}
    </div>`;

  const recarregar = () => vistaCategorias(v);
  const executar = async (promessa, mensagem) => {
    try { await promessa; avisar(mensagem); recarregar(); } catch (erro) { avisar(erro.message, 'erro'); }
  };

  v.querySelector('#form-nova-categoria').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = e.target.querySelector('input').value.trim();
    executar(api('/api/admin/categorias', { metodo: 'POST', corpo: { nome } }), `Categoria “${nome}” criada.`);
  });

  v.querySelectorAll('[data-acao="nova-sub"]').forEach((form) => form.addEventListener('submit', (e) => {
    e.preventDefault();
    const catId = form.closest('[data-id]').dataset.id;
    const nome = form.querySelector('input').value.trim();
    executar(api(`/api/admin/categorias/${catId}/subcategorias`, { metodo: 'POST', corpo: { nome } }), `Subcategoria “${nome}” criada.`);
  }));

  v.querySelector('.lista-categorias').addEventListener('click', async (e) => {
    const botao = e.target.closest('button[data-acao]');
    if (!botao) return;
    const cat = categorias.find((c) => c.id === Number(botao.closest('[data-id]').dataset.id));
    const sub = cat.subcategorias.find((s) => s.id === Number(botao.closest('[data-sub]')?.dataset.sub));

    if (botao.dataset.acao === 'renomear-cat') {
      const nome = await pedirTexto({ titulo: 'Renomear categoria', rotulo: 'Nome', valor: cat.nome });
      if (nome) executar(api(`/api/admin/categorias/${cat.id}`, { metodo: 'PUT', corpo: { nome } }), 'Categoria renomeada.');
    }
    if (botao.dataset.acao === 'excluir-cat') {
      if (cat.total) return avisar(`“${cat.nome}” tem ${cat.total} produto(s). Mova ou exclua os produtos antes.`, 'erro');
      if (await confirmar({ titulo: 'Excluir categoria', mensagem: `Excluir “${cat.nome}” e suas subcategorias?`, botao: 'Excluir', perigo: true })) {
        executar(api(`/api/admin/categorias/${cat.id}`, { metodo: 'DELETE' }), 'Categoria excluída.');
      }
    }
    if (botao.dataset.acao === 'renomear-sub') {
      const nome = await pedirTexto({ titulo: 'Renomear subcategoria', rotulo: 'Nome', valor: sub.nome });
      if (nome) executar(api(`/api/admin/subcategorias/${sub.id}`, { metodo: 'PUT', corpo: { nome } }), 'Subcategoria renomeada.');
    }
    if (botao.dataset.acao === 'excluir-sub') {
      const aviso = sub.total ? ` Os ${sub.total} produto(s) dela continuam em “${cat.nome}”, sem subcategoria.` : '';
      if (await confirmar({ titulo: 'Excluir subcategoria', mensagem: `Excluir “${sub.nome}”?${aviso}`, botao: 'Excluir', perigo: true })) {
        executar(api(`/api/admin/subcategorias/${sub.id}`, { metodo: 'DELETE' }), 'Subcategoria excluída.');
      }
    }
  });
}

// ---------------------------------------------------------------- Configurações
async function vistaConfiguracoes(v) {
  const c = await api('/api/admin/configuracoes');
  v.innerHTML = `
    <div class="cabecalho"><div><h1>Configurações</h1><p>Dados da loja exibidos no catálogo e usados no envio dos pedidos.</p></div></div>
    <div class="secoes-config">
      <form class="secao" id="form-loja">
        <h2>Loja</h2>
        <label class="campo"><span>Nome da loja</span><input class="input" name="loja_nome" maxlength="80" value="${esc(c.loja_nome)}"></label>
        <label class="campo"><span>WhatsApp que recebe os pedidos</span>
          <input class="input" name="loja_whatsapp" type="tel" placeholder="(11) 98888-7777" value="${esc(c.loja_whatsapp)}">
          <small>Com DDD. Deixe em branco para esconder o botão de WhatsApp no catálogo.</small>
        </label>
        <label class="campo"><span>E-mail que recebe os pedidos</span>
          <input class="input" name="loja_email" type="email" value="${esc(c.loja_email)}">
          <small>Deixe em branco para esconder o botão de e-mail.</small>
        </label>
        <label class="campo"><span>Mensagem após o envio do pedido</span>
          <textarea class="textarea" name="loja_mensagem" maxlength="500" rows="2">${esc(c.loja_mensagem)}</textarea>
        </label>
        <div class="acoes"><button class="btn btn-primario" type="submit">Salvar dados da loja</button></div>
      </form>

      <form class="secao" id="form-senha">
        <h2>Alterar senha</h2>
        <p>Ao trocar a senha, as outras sessões abertas são encerradas.</p>
        <input type="text" name="usuario" autocomplete="username" value="${esc($('usuario-nome').title)}" hidden>
        <label class="campo"><span>Senha atual</span><input class="input" name="atual" type="password" autocomplete="current-password" required></label>
        <label class="campo"><span>Nova senha</span><input class="input" name="nova" type="password" autocomplete="new-password" minlength="8" required><small>Mínimo de 8 caracteres.</small></label>
        <div class="acoes"><button class="btn btn-primario" type="submit">Alterar senha</button></div>
      </form>
    </div>`;

  const formLoja = v.querySelector('#form-loja');
  formLoja.loja_whatsapp.addEventListener('input', (e) => { e.target.value = mascararTelefone(e.target.value); });
  formLoja.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const salvo = await api('/api/admin/configuracoes', { metodo: 'PUT', corpo: Object.fromEntries(new FormData(formLoja)) });
      $('nome-loja-painel').textContent = salvo.loja_nome;
      avisar('Dados da loja salvos.');
    } catch (erro) { avisar(erro.message, 'erro'); }
  });

  const formSenha = v.querySelector('#form-senha');
  formSenha.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { atual, nova } = Object.fromEntries(new FormData(formSenha));
    if (nova.length < 8) return avisar('A nova senha precisa ter pelo menos 8 caracteres.', 'erro');
    try {
      await api('/api/admin/senha', { metodo: 'PUT', corpo: { atual, nova } });
      formSenha.reset();
      avisar('Senha alterada.');
    } catch (erro) { avisar(erro.message, 'erro'); }
  });
}

iniciar();
