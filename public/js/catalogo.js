// Catálogo público: barra lateral com categorias e temas, busca, grade e detalhes do produto.
import { URL_BASE, configurado, rest } from './supabase.js';
import {
  armazenamento, debounce, esc, formatarReais, icone, imagemProduto, semAcento, slugify,
} from './util.js';
import { LOJA_PADRAO, aplicarCores, linkWhatsApp, logoHtml, redesHtml } from './loja.js';
import { bandeira, idiomaDe, seloIdioma } from './idiomas.js';

const $ = (id) => document.getElementById(id);
const CACHE_LOJA = `wpv_loja:${URL_BASE}`; // evita "piscar" a cor padrão antes de carregar a da loja

let loja = { ...LOJA_PADRAO, ...(configurado ? armazenamento.ler(CACHE_LOJA, {}) : {}) };
let categorias = [];
let temas = [];
let produtos = [];

// O filtro fica na URL (?categoria=etb&temas=pokemon&q=...) para dar para compartilhar o link.
const estado = { categoria: '', temas: [], q: '', ordem: '' };
function lerUrl() {
  const p = new URLSearchParams(location.search);
  estado.categoria = p.get('categoria') || '';
  estado.temas = (p.get('temas') || '').split(',').filter(Boolean);
  estado.q = p.get('q') || '';
  estado.ordem = p.get('ordem') || '';
  return p.get('produto');
}

// ---------------------------------------------------------------- Início
async function iniciar() {
  document.querySelectorAll('[data-icone]').forEach((el) => { el.innerHTML = icone(el.dataset.icone); });
  document.querySelector('.busca-icone').innerHTML = icone('busca');
  $('fechar-lateral').innerHTML = icone('fechar');
  aplicarLoja();

  if (!configurado) {
    $('conteudo').closest('.layout').innerHTML = `
      <div class="config-pendente">
        <h1>Quase lá!</h1>
        <p>Preencha o endereço e a chave pública do Supabase em <code>js/config.js</code>
        e rode o <code>supabase/schema.sql</code> no seu projeto. O passo a passo está no README.</p>
      </div>`;
    return;
  }

  const produtoInicial = lerUrl();
  $('busca').value = estado.q;
  $('ordem').value = estado.ordem;
  ligarEventos();

  try {
    const [linhasLoja, cats, tms, prods] = await Promise.all([
      rest('loja?select=*&id=eq.1'),
      rest('categorias?select=id,nome,ordem&order=ordem,nome'),
      rest('temas?select=id,nome,cor,ordem&order=ordem,nome'),
      rest('produtos?select=*&ativo=is.true&order=nome'),
    ]);
    if (linhasLoja[0]) {
      loja = { ...LOJA_PADRAO, ...linhasLoja[0] };
      armazenamento.gravar(CACHE_LOJA, loja);
      aplicarLoja();
    }
    categorias = cats.map((c) => ({ ...c, slug: slugify(c.nome) }));
    temas = tms.map((t) => ({ ...t, slug: slugify(t.nome) }));
    const porCategoria = new Map(categorias.map((c) => [c.id, c]));
    const porTema = new Map(temas.map((t) => [t.id, t]));
    produtos = prods.map((p) => {
      const categoria = porCategoria.get(p.categoria_id);
      const tema = porTema.get(p.tema_id) || null;
      const idioma = idiomaDe(p.idioma);
      return {
        ...p, categoria, tema, idioma: idioma.codigo,
        busca: semAcento(`${p.nome} ${p.descricao} ${p.conteudo} ${p.codigo_barras || ''} ${categoria?.nome || ''} ${tema?.nome || ''} ${idioma.nome}${p.pre_venda ? ' pre-venda prevenda' : ''}`),
      };
    });
  } catch (erro) {
    $('grade').innerHTML = `<div class="vazio"><strong>Não foi possível carregar o catálogo</strong>${esc(erro.message)}</div>`;
    $('grade').removeAttribute('aria-busy');
    $('lista-categorias').innerHTML = '';
    return;
  }

  renderizar();
  $('grade').removeAttribute('aria-busy');
  if (produtoInicial) {
    const p = produtos.find((x) => String(x.id) === produtoInicial);
    if (p) abrirProduto(p, { atualizarUrl: false });
  }
}

function aplicarLoja() {
  aplicarCores(loja.cor_primaria);
  document.title = loja.slogan ? `${loja.nome} · ${loja.slogan}` : loja.nome;
  document.querySelector('meta[name="description"]').content = loja.slogan || `Catálogo de produtos de ${loja.nome}.`;
  if (loja.logo_url) $('favicon').href = loja.logo_url;
  $('marca').querySelector('.logo').outerHTML = logoHtml(loja);
  $('nome-loja').textContent = loja.nome;
  $('slogan-loja').textContent = loja.slogan;
  $('redes').innerHTML = redesHtml(loja);
  $('rodape').innerHTML = `
    <div class="rodape-interno">
      <a class="marca" href="/">${logoHtml(loja)}<span class="marca-nome">${esc(loja.nome)}</span></a>
      <span>© ${new Date().getFullYear()}</span>
      <nav class="redes" aria-label="Redes sociais">${redesHtml(loja)}</nav>
    </div>`;
}

// ---------------------------------------------------------------- Eventos
function ligarEventos() {
  const buscar = debounce(() => { estado.q = $('busca').value.trim(); aplicarFiltro({ substituir: true }); }, 250);
  $('busca').addEventListener('input', buscar);
  $('form-busca').addEventListener('submit', (e) => { e.preventDefault(); $('busca').blur(); });
  $('ordem').addEventListener('change', (e) => { estado.ordem = e.target.value; aplicarFiltro({ substituir: true }); });

  $('lista-categorias').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-categoria]');
    if (!botao) return;
    estado.categoria = botao.dataset.categoria;
    aplicarFiltro();
  });
  $('lista-temas').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-tema]');
    if (!botao) return;
    const slug = botao.dataset.tema;
    estado.temas = estado.temas.includes(slug) ? estado.temas.filter((t) => t !== slug) : [...estado.temas, slug];
    aplicarFiltro();
  });
  $('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-remover]');
    if (!chip) return;
    const [tipo, valor] = chip.dataset.remover.split(':');
    if (tipo === 'tema') estado.temas = estado.temas.filter((t) => t !== valor);
    if (tipo === 'busca') { estado.q = ''; $('busca').value = ''; }
    if (tipo === 'categoria') estado.categoria = '';
    if (tipo === 'tudo') { Object.assign(estado, { categoria: '', temas: [], q: '' }); $('busca').value = ''; }
    aplicarFiltro();
  });

  // Gaveta de filtros (celular)
  document.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => {
    alternarFiltros(true);
    $(b.dataset.abrir).scrollIntoView({ block: 'start' });
  }));
  $('fechar-lateral').addEventListener('click', () => alternarFiltros(false));
  $('veu-lateral').addEventListener('click', () => alternarFiltros(false));
  $('ver-resultados').addEventListener('click', () => alternarFiltros(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('lateral').classList.contains('aberta')) alternarFiltros(false);
  });

  // Clique no card abre os detalhes (o link também funciona sozinho: ?produto=ID).
  $('grade').addEventListener('click', (e) => {
    const link = e.target.closest('a[data-produto]');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    abrirProduto(produtos.find((p) => p.id === Number(link.dataset.produto)));
  });

  window.addEventListener('popstate', () => {
    const produtoId = lerUrl();
    $('busca').value = estado.q;
    $('ordem').value = estado.ordem;
    renderizar();
    const modal = $('modal-produto');
    const p = produtoId && produtos.find((x) => String(x.id) === produtoId);
    if (p) abrirProduto(p, { atualizarUrl: false });
    else if (modal.open) modal.close();
  });
}

function alternarFiltros(abrir) {
  $('lateral').classList.toggle('aberta', abrir);
  $('veu-lateral').classList.toggle('aberto', abrir);
  document.body.style.overflow = abrir ? 'hidden' : '';
}

function montarUrl(produtoId) {
  const p = new URLSearchParams();
  if (estado.categoria) p.set('categoria', estado.categoria);
  if (estado.temas.length) p.set('temas', estado.temas.join(','));
  if (estado.q) p.set('q', estado.q);
  if (estado.ordem) p.set('ordem', estado.ordem);
  if (produtoId) p.set('produto', produtoId);
  const busca = p.toString();
  return busca ? `?${busca.replace(/%2C/g, ',')}` : location.pathname;
}

/** Busca e ordenação usam replaceState para não encher o histórico a cada tecla. */
function aplicarFiltro({ substituir = false } = {}) {
  const url = montarUrl();
  if (url !== `${location.search || location.pathname}`) history[substituir ? 'replaceState' : 'pushState'](null, '', url);
  renderizar();
}

// ---------------------------------------------------------------- Filtragem
/** Filtra os produtos. `ignorar` permite contar um filtro sem ele mesmo (contagens da lateral). */
function filtrar({ ignorar } = {}) {
  const termos = semAcento(estado.q).split(/\s+/).filter(Boolean);
  return produtos.filter((p) => {
    if (ignorar !== 'categoria' && estado.categoria && p.categoria?.slug !== estado.categoria) return false;
    if (ignorar !== 'temas' && estado.temas.length && !estado.temas.includes(p.tema?.slug)) return false;
    return termos.every((t) => p.busca.includes(t));
  });
}

const ORDENACOES = {
  '': (a, b) => pedivel(b) - pedivel(a) || a.nome.localeCompare(b.nome, 'pt-BR'),
  recentes: (a, b) => b.criado_em.localeCompare(a.criado_em),
  nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  menor_preco: (a, b) => a.preco_centavos - b.preco_centavos,
  maior_preco: (a, b) => b.preco_centavos - a.preco_centavos,
};

// ---------------------------------------------------------------- Renderização
function renderizar() {
  // Ignora filtros que apontam para algo que não existe mais (link antigo).
  if (estado.categoria && !categorias.some((c) => c.slug === estado.categoria)) estado.categoria = '';
  estado.temas = estado.temas.filter((s) => temas.some((t) => t.slug === s));

  renderizarCategorias();
  renderizarTemas();
  const lista = filtrar().sort(ORDENACOES[estado.ordem] || ORDENACOES['']);
  renderizarBarra(lista.length);
  renderizarGrade(lista);
  $('ver-resultados').textContent = lista.length === 1 ? 'Ver 1 produto' : `Ver ${lista.length} produtos`;
}

function renderizarCategorias() {
  const base = filtrar({ ignorar: 'categoria' });
  const contagem = (id) => base.filter((p) => p.categoria_id === id).length;
  const totalPorCategoria = (id) => produtos.filter((p) => p.categoria_id === id).length;
  const item = (slug, nome, n) => `
    <li><button class="filtro${n ? '' : ' vazio-filtro'}" type="button" data-categoria="${esc(slug)}" aria-pressed="${estado.categoria === slug}">
      <span class="nome">${esc(nome)}</span><span class="n">${n}</span>
    </button></li>`;
  $('lista-categorias').innerHTML = item('', 'Todos os produtos', base.length)
    + categorias.filter((c) => totalPorCategoria(c.id)).map((c) => item(c.slug, c.nome, contagem(c.id))).join('');
}

function renderizarTemas() {
  const base = filtrar({ ignorar: 'temas' });
  const visiveis = temas.filter((t) => produtos.some((p) => p.tema_id === t.id));
  $('secao-temas').hidden = !visiveis.length;
  document.querySelector('[data-abrir="secao-temas"]').hidden = !visiveis.length;
  $('lista-temas').innerHTML = visiveis.map((t) => {
    const n = base.filter((p) => p.tema_id === t.id).length;
    return `
      <li><button class="filtro filtro-tema${n ? '' : ' vazio-filtro'}" type="button" data-tema="${esc(t.slug)}"
          aria-pressed="${estado.temas.includes(t.slug)}" style="--cor:${esc(t.cor)}">
        <span class="caixinha" aria-hidden="true"></span>
        <span class="nome">${esc(t.nome)}</span><span class="n">${n}</span>
      </button></li>`;
  }).join('');
  const qtd = estado.temas.length;
  $('contagem-temas').hidden = !qtd;
  $('contagem-temas').textContent = qtd;
}

function renderizarBarra(n) {
  const categoria = categorias.find((c) => c.slug === estado.categoria);
  $('titulo').textContent = categoria ? categoria.nome : 'Todos os produtos';
  $('resultado').textContent = n === 1 ? '1 item' : `${n} itens`;

  const chips = [];
  if (categoria) {
    chips.push(`<button class="chip so-mobile-chip" type="button" data-remover="categoria:" aria-label="Remover filtro de categoria ${esc(categoria.nome)}">${esc(categoria.nome)}${icone('fechar')}</button>`);
  }
  for (const slug of estado.temas) {
    const t = temas.find((x) => x.slug === slug);
    chips.push(`<button class="chip" type="button" data-remover="tema:${esc(slug)}" style="--cor:${esc(t.cor)}" aria-label="Remover tema ${esc(t.nome)}">
      <span class="ponto"></span>${esc(t.nome)}${icone('fechar')}</button>`);
  }
  if (estado.q) {
    chips.push(`<button class="chip" type="button" data-remover="busca:" aria-label="Limpar busca">“${esc(estado.q)}”${icone('fechar')}</button>`);
  }
  if (chips.length > 1 || (chips.length && categoria)) {
    chips.push('<button class="chip chip-limpar" type="button" data-remover="tudo:">Limpar filtros</button>');
  }
  $('chips').innerHTML = chips.join('');
}

/** Dá para pedir agora: tem estoque ou está em pré-venda. */
function pedivel(p) { return p.pre_venda || p.estoque > 0; }

function disponibilidade({ estoque, pre_venda: preVenda }) {
  if (preVenda) return '<span class="estoque pre-venda">Pré-venda</span>';
  if (estoque <= 0) return '<span class="estoque zero">Esgotado</span>';
  if (estoque <= 3) return `<span class="estoque baixo">Últimas ${estoque} un.</span>`;
  return '<span class="estoque">Disponível</span>';
}

const etiquetaTema = (tema) => (tema
  ? `<span class="etiqueta-tema" style="--cor:${esc(tema.cor)}"><span class="ponto"></span>${esc(tema.nome)}</span>` : '');

function renderizarGrade(lista) {
  if (!produtos.length) {
    $('grade').innerHTML = '<div class="vazio"><strong>Catálogo em preparação</strong>Os produtos aparecem aqui assim que forem cadastrados.</div>';
    return;
  }
  if (!lista.length) {
    $('grade').innerHTML = `
      <div class="vazio"><strong>Nenhum produto encontrado</strong>
      ${estado.q ? 'Tente outra palavra ou confira o código de barras.' : 'Tente tirar algum filtro.'}</div>`;
    return;
  }
  $('grade').innerHTML = lista.map((p) => `
    <article class="card${pedivel(p) ? '' : ' esgotado'}">
      <div class="card-imagem">${imagemProduto(p)}${etiquetaTema(p.tema)}${seloIdioma(p.idioma)}</div>
      <div class="card-corpo">
        <span class="card-categoria">${esc(p.categoria?.nome || '')}</span>
        <h3 class="card-nome"><a href="?produto=${p.id}" data-produto="${p.id}">${esc(p.nome)}</a></h3>
        <span class="card-conteudo">${esc(p.conteudo)}</span>
        <div class="card-rodape">
          <span class="card-preco">${formatarReais(p.preco_centavos)}</span>
          ${disponibilidade(p)}
        </div>
      </div>
    </article>`).join('');
}

// ---------------------------------------------------------------- Detalhes do produto
function abrirProduto(produto, { atualizarUrl = true } = {}) {
  if (!produto) return;
  const modal = $('modal-produto');
  const preco = formatarReais(produto.preco_centavos);
  const detalhe = `*${produto.nome}*${produto.conteudo ? ` (${produto.conteudo})` : ''}\nPreço: ${preco}`;
  let mensagem = `Olá! Pode me avisar quando este produto voltar ao estoque?\n*${produto.nome}*`;
  let botao = 'Avise-me quando chegar';
  if (produto.pre_venda) {
    mensagem = `Olá! Quero reservar este produto da pré-venda:\n${detalhe}`;
    botao = 'Reservar pelo WhatsApp';
  } else if (produto.estoque > 0) {
    mensagem = `Olá! Tenho interesse neste produto do catálogo:\n${detalhe}`;
    botao = 'Pedir pelo WhatsApp';
  }
  const whats = linkWhatsApp(loja, `${mensagem}\n${location.origin}${location.pathname}?produto=${produto.id}`);

  modal.innerHTML = `
    <div class="modal-topo">
      <span class="card-categoria">${esc(produto.categoria?.nome || '')}</span>
      <button class="btn btn-fantasma btn-icone" type="button" data-fechar aria-label="Fechar">${icone('fechar')}</button>
    </div>
    <div class="modal-corpo">
      <div class="produto-imagem">${imagemProduto(produto)}</div>
      <div class="produto-info">
        <div class="etiquetas">${etiquetaTema(produto.tema)}${seloIdioma(produto.idioma)}</div>
        <h2 id="titulo-produto">${esc(produto.nome)}</h2>
        <div class="preco">${preco}</div>
        <div>${disponibilidade(produto)}</div>
        ${produto.pre_venda ? '<p class="aviso-pre-venda">Produto em pré-venda: reserve agora e receba assim que ele chegar.</p>' : ''}
        ${produto.descricao ? `<p class="descricao">${esc(produto.descricao)}</p>` : ''}
        <dl class="ficha">
          <dt>Idioma</dt><dd class="ficha-idioma">${bandeira(produto.idioma)}${esc(idiomaDe(produto.idioma).nome)}</dd>
          ${produto.conteudo ? `<dt>Conteúdo</dt><dd>${esc(produto.conteudo)}</dd>` : ''}
          ${produto.codigo_barras ? `<dt>Código de barras</dt><dd class="mono">${esc(produto.codigo_barras)}</dd>` : ''}
          ${produto.estoque > 0 && !produto.pre_venda ? `<dt>Estoque</dt><dd>${produto.estoque} unidade(s)</dd>` : ''}
        </dl>
        <div class="produto-acoes">
          ${whats ? `<a class="btn btn-whatsapp btn-bloco" href="${esc(whats)}" target="_blank" rel="noopener">${icone('whatsapp')}
            ${botao}</a>` : ''}
        </div>
      </div>
    </div>`;
  modal.querySelector('[data-fechar]').addEventListener('click', () => modal.close());
  modal.onclick = (e) => { if (e.target === modal) modal.close(); };
  modal.onclose = () => {
    if (new URLSearchParams(location.search).has('produto')) history.replaceState(null, '', montarUrl());
  };
  if (atualizarUrl) history.replaceState(null, '', montarUrl(produto.id));
  if (!modal.open) modal.showModal();
}

iniciar();
