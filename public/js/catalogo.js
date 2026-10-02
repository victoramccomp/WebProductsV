// Página pública do catálogo: sidebar de categorias, busca, grade e detalhes do produto.
import { api, avisar, debounce, esc, formatarReais, icone, imagemProduto } from './util.js';
import { carrinho, iniciarCarrinho } from './carrinho.js';

const $ = (id) => document.getElementById(id);

// O filtro fica na URL (?categoria=bebidas&subcategoria=sucos&q=cafe) para poder compartilhar o link.
const params = new URLSearchParams(location.search);
const estado = {
  categoria: params.get('categoria') || '',
  subcategoria: params.get('subcategoria') || '',
  q: params.get('q') || '',
  ordem: params.get('ordem') || '',
};

let categorias = [];
let produtosVisiveis = new Map();
let requisicaoAtual = null;

// ---------------------------------------------------------------- Início
async function iniciar() {
  $('abrir-lateral').innerHTML = icone('filtro');
  $('fechar-lateral').innerHTML = icone('fechar');
  document.querySelector('.busca-icone').innerHTML = icone('busca');
  document.querySelector('.marca-icone').innerHTML = icone('loja');
  $('busca').value = estado.q;
  $('ordem').value = estado.ordem;

  const loja = await api('/api/loja').catch(() => ({ nome: 'Catálogo' }));
  $('nome-loja').textContent = loja.nome;
  document.title = `${loja.nome} · Catálogo`;
  iniciarCarrinho(loja);
  carrinho.aoMudar(atualizarCards);

  ligarEventos();
  await Promise.all([carregarCategorias(), carregarProdutos()]);
}

function ligarEventos() {
  const buscar = debounce(() => { estado.q = $('busca').value.trim(); aplicarFiltro({ substituir: true }); }, 300);
  $('busca').addEventListener('input', buscar);
  $('form-busca').addEventListener('submit', (e) => { e.preventDefault(); $('busca').blur(); });
  $('ordem').addEventListener('change', (e) => { estado.ordem = e.target.value; aplicarFiltro({ substituir: true }); });

  $('abrir-lateral').addEventListener('click', () => alternarLateral(true));
  $('fechar-lateral').addEventListener('click', () => alternarLateral(false));
  $('veu-lateral').addEventListener('click', () => alternarLateral(false));

  $('lista-categorias').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-categoria]');
    if (!botao) return;
    const { categoria, subcategoria } = botao.dataset;
    // Clicar de novo na categoria ativa (sem sub) recolhe e mostra tudo.
    if (categoria && categoria === estado.categoria && !subcategoria && !estado.subcategoria) {
      estado.categoria = '';
    } else {
      estado.categoria = categoria;
    }
    estado.subcategoria = subcategoria || '';
    aplicarFiltro();
    if (subcategoria || !categoria || window.matchMedia('(max-width: 900px)').matches && !temSubcategorias(categoria)) {
      alternarLateral(false);
    }
  });

  $('trilha').addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-ir]');
    if (!alvo) return;
    if (alvo.dataset.ir === 'tudo') { estado.categoria = ''; estado.subcategoria = ''; estado.q = ''; $('busca').value = ''; }
    if (alvo.dataset.ir === 'categoria') estado.subcategoria = '';
    if (alvo.dataset.ir === 'busca') { estado.q = ''; $('busca').value = ''; }
    aplicarFiltro();
  });

  $('grade').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const produto = produtosVisiveis.get(Number(card.dataset.id));
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'adicionar') { carrinho.adicionar(produto); avisar(`${produto.nome} adicionado ao pedido.`); }
    if (acao === 'mais') carrinho.adicionar(produto, 1);
    if (acao === 'menos') carrinho.adicionar(produto, -1);
    if (acao === 'detalhes') abrirProduto(produto);
  });
  $('grade').addEventListener('change', (e) => {
    if (!e.target.matches('.quantidade input')) return;
    const produto = produtosVisiveis.get(Number(e.target.closest('.card').dataset.id));
    carrinho.definir(produto, Number(e.target.value) || 0);
  });

  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(location.search);
    Object.assign(estado, {
      categoria: p.get('categoria') || '', subcategoria: p.get('subcategoria') || '',
      q: p.get('q') || '', ordem: p.get('ordem') || '',
    });
    $('busca').value = estado.q;
    $('ordem').value = estado.ordem;
    renderizarCategorias();
    carregarProdutos();
  });
}

const temSubcategorias = (slug) => !!categorias.find((c) => c.slug === slug)?.subcategorias.length;

function alternarLateral(abrir) {
  $('lateral').classList.toggle('aberta', abrir);
  $('veu-lateral').classList.toggle('aberto', abrir);
  $('abrir-lateral').setAttribute('aria-expanded', abrir);
}

/** Atualiza a URL e recarrega. Busca e ordenação usam replaceState para não encher o histórico. */
function aplicarFiltro({ substituir = false } = {}) {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(estado)) if (valor) p.set(chave, valor);
  const busca = p.toString() ? `?${p}` : '';
  if (busca !== location.search) {
    history[substituir ? 'replaceState' : 'pushState'](null, '', busca || location.pathname);
  }
  renderizarCategorias();
  carregarProdutos();
}

// ---------------------------------------------------------------- Sidebar
async function carregarCategorias() {
  try {
    categorias = await api('/api/categorias');
  } catch (erro) {
    $('lista-categorias').innerHTML = `<div class="vazio">${esc(erro.message)}</div>`;
    return;
  }
  renderizarCategorias();
}

function renderizarCategorias() {
  const totalGeral = categorias.reduce((s, c) => s + c.total, 0);
  const botao = ({ nome, total, categoria = '', subcategoria = '', ativo, expandido }) => `
    <button class="cat-botao${ativo ? ' ativo' : ''}" type="button"
      data-categoria="${esc(categoria)}" ${subcategoria ? `data-subcategoria="${esc(subcategoria)}"` : ''}
      ${expandido !== undefined ? `aria-expanded="${expandido}"` : ''} ${ativo ? 'aria-current="true"' : ''}>
      <span class="nome">${esc(nome)}</span>
      <span class="qtd">${total}</span>
      ${expandido !== undefined ? `<span class="seta">${icone('seta', 'icone')}</span>` : ''}
    </button>`;

  $('lista-categorias').innerHTML = `
    <p class="lateral-titulo">Categorias</p>
    <ul class="lista-cat">
      <li>${botao({ nome: 'Todos os produtos', total: totalGeral, ativo: !estado.categoria })}</li>
      ${categorias.map((c) => {
        const aberta = c.slug === estado.categoria;
        const temSubs = c.subcategorias.length > 0;
        return `<li>
          ${botao({ nome: c.nome, total: c.total, categoria: c.slug, ativo: aberta && !estado.subcategoria, expandido: temSubs ? aberta : undefined })}
          ${temSubs && aberta ? `<ul class="lista-sub">
            ${c.subcategorias.map((s) => `<li>${botao({
              nome: s.nome, total: s.total, categoria: c.slug, subcategoria: s.slug, ativo: s.slug === estado.subcategoria,
            })}</li>`).join('')}
          </ul>` : ''}
        </li>`;
      }).join('')}
    </ul>`;
}

// ---------------------------------------------------------------- Produtos
async function carregarProdutos() {
  requisicaoAtual?.abort();
  const controle = new AbortController();
  requisicaoAtual = controle;
  renderizarTrilha();

  const p = new URLSearchParams();
  if (estado.categoria) p.set('categoria', estado.categoria);
  if (estado.subcategoria) p.set('subcategoria', estado.subcategoria);
  if (estado.q) p.set('q', estado.q);
  if (estado.ordem) p.set('ordem', estado.ordem);

  $('grade').setAttribute('aria-busy', 'true');
  try {
    const resposta = await fetch(`/api/produtos?${p}`, { signal: controle.signal });
    if (!resposta.ok) throw new Error('Não foi possível carregar os produtos.');
    const produtos = await resposta.json();
    produtosVisiveis = new Map(produtos.map((pr) => [pr.id, pr]));
    carrinho.sincronizar(produtos);
    renderizarGrade(produtos);
  } catch (erro) {
    if (erro.name === 'AbortError') return;
    $('grade').innerHTML = `<div class="vazio"><strong>Ops!</strong>${esc(erro.message)}</div>`;
  } finally {
    if (requisicaoAtual === controle) $('grade').removeAttribute('aria-busy');
  }
}

function renderizarTrilha() {
  const cat = categorias.find((c) => c.slug === estado.categoria);
  const sub = cat?.subcategorias.find((s) => s.slug === estado.subcategoria);
  const partes = [];
  if (!cat) partes.push(`<span>${estado.q ? 'Resultados da busca' : 'Todos os produtos'}</span>`);
  if (cat) partes.push(sub ? `<button type="button" data-ir="categoria">${esc(cat.nome)}</button>` : `<span>${esc(cat.nome)}</span>`);
  if (sub) partes.push(`<span class="sep">/</span><span>${esc(sub.nome)}</span>`);
  if (cat || estado.q) partes.push(`<button type="button" class="limpar" data-ir="tudo">Limpar filtros</button>`);
  $('trilha').innerHTML = partes.join('');
}

const disponibilidade = (estoque) => {
  if (estoque <= 0) return '<span class="selo selo-perigo">Esgotado</span>';
  if (estoque <= 5) return `<span class="selo selo-alerta">Últimas ${estoque} un.</span>`;
  return '<span class="selo selo-sucesso">Disponível</span>';
};

function controleQuantidade(produto) {
  const qtd = carrinho.quantidade(produto.id);
  if (produto.estoque <= 0) return '<button class="btn btn-bloco" type="button" disabled>Indisponível</button>';
  if (!qtd) {
    return `<button class="btn btn-primario btn-bloco" type="button" data-acao="adicionar">${icone('mais')} <span>Adicionar<span class="texto-longo"> ao pedido</span></span></button>`;
  }
  return `
    <div class="quantidade" role="group" aria-label="Quantidade de ${esc(produto.nome)} no pedido">
      <button type="button" data-acao="menos" aria-label="${qtd === 1 ? 'Remover do pedido' : 'Diminuir'}">${icone(qtd === 1 ? 'lixo' : 'menos')}</button>
      <input type="number" min="0" max="${produto.estoque}" value="${qtd}" aria-label="Quantidade">
      <button type="button" data-acao="mais" aria-label="Aumentar" ${qtd >= produto.estoque ? 'disabled' : ''}>${icone('mais')}</button>
    </div>`;
}

function renderizarGrade(produtos) {
  const n = produtos.length;
  $('resultado').textContent = `${n} ${n === 1 ? 'produto encontrado' : 'produtos encontrados'}${estado.q ? ` para “${estado.q}”` : ''}`;
  if (!n) {
    $('grade').innerHTML = `
      <div class="vazio">
        <strong>Nenhum produto encontrado</strong>
        ${estado.q ? 'Tente outra palavra ou confira o código de barras.' : 'Ainda não há produtos nesta categoria.'}
      </div>`;
    return;
  }
  $('grade').innerHTML = produtos.map((p) => `
    <article class="card${p.estoque <= 0 ? ' esgotado' : ''}" data-id="${p.id}">
      <button class="card-imagem" type="button" data-acao="detalhes" aria-label="Ver detalhes de ${esc(p.nome)}">
        ${imagemProduto(p)}
        ${disponibilidade(p.estoque)}
      </button>
      <div class="card-corpo">
        <span class="card-categoria">${esc(p.subcategoria || p.categoria)}</span>
        <h3 class="card-nome"><button type="button" data-acao="detalhes">${esc(p.nome)}</button></h3>
        <span class="card-conteudo">${esc(p.conteudo)}</span>
        <div class="card-rodape">
          <span class="card-preco">${formatarReais(p.preco_centavos)}</span>
          <div class="card-controle">${controleQuantidade(p)}</div>
        </div>
      </div>
    </article>`).join('');
}

/** Quando o carrinho muda, só os controles dos cards são redesenhados (mantém a rolagem). */
function atualizarCards() {
  document.querySelectorAll('.card').forEach((card) => {
    const produto = produtosVisiveis.get(Number(card.dataset.id));
    if (!produto) return;
    const alvo = card.querySelector('.card-controle');
    const foco = alvo.contains(document.activeElement) ? document.activeElement.dataset.acao || 'input' : null;
    alvo.innerHTML = controleQuantidade(produto);
    if (foco) (alvo.querySelector(`[data-acao="${foco}"]`) || alvo.querySelector('button, input'))?.focus();
  });
  if ($('modal-produto').open) atualizarControleModal();
}

// ---------------------------------------------------------------- Modal de detalhes
let produtoAberto = null;

function abrirProduto(produto) {
  produtoAberto = produto;
  const modal = $('modal-produto');
  modal.innerHTML = `
    <div class="modal-topo">
      <span class="card-categoria">${esc(produto.categoria)}${produto.subcategoria ? ` / ${esc(produto.subcategoria)}` : ''}</span>
      <button class="btn btn-fantasma btn-icone" type="button" data-fechar aria-label="Fechar">${icone('fechar')}</button>
    </div>
    <div class="modal-corpo">
      <div class="produto-imagem">${imagemProduto(produto)}</div>
      <div class="produto-info">
        <h2 id="titulo-produto">${esc(produto.nome)}</h2>
        <div>${disponibilidade(produto.estoque)}</div>
        <div class="preco">${formatarReais(produto.preco_centavos)}</div>
        ${produto.descricao ? `<p class="descricao">${esc(produto.descricao)}</p>` : ''}
        <dl class="ficha">
          ${produto.conteudo ? `<dt>Conteúdo</dt><dd>${esc(produto.conteudo)}</dd>` : ''}
          ${produto.codigo_barras ? `<dt>Código de barras</dt><dd class="mono">${esc(produto.codigo_barras)}</dd>` : ''}
          <dt>Estoque</dt><dd>${produto.estoque > 0 ? `${produto.estoque} unidade(s)` : 'Esgotado'}</dd>
        </dl>
        <div class="produto-acoes" id="controle-modal"></div>
      </div>
    </div>`;
  atualizarControleModal();
  modal.querySelector('[data-fechar]').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); }, { once: true });
  modal.showModal();
}

function atualizarControleModal() {
  const alvo = $('controle-modal');
  if (!alvo || !produtoAberto) return;
  const qtd = carrinho.quantidade(produtoAberto.id);
  alvo.innerHTML = `
    <div class="card-controle" style="flex:1">${controleQuantidade(produtoAberto)}</div>
    ${qtd ? '<button class="btn" type="button" data-ver-pedido>Ver pedido</button>' : ''}`;
  alvo.onclick = (e) => {
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'adicionar' || acao === 'mais') carrinho.adicionar(produtoAberto, 1);
    if (acao === 'menos') carrinho.adicionar(produtoAberto, -1);
    if (e.target.closest('[data-ver-pedido]')) { $('modal-produto').close(); $('abrir-carrinho').click(); }
  };
  alvo.onchange = (e) => {
    if (e.target.matches('input')) carrinho.definir(produtoAberto, Number(e.target.value) || 0);
  };
}

iniciar();
