// Painel › Catálogo em PDF.
// Monta folhas A4 com a identidade da loja (cor, logo, redes e cores dos temas) e usa a impressão do
// navegador ("Salvar como PDF"): texto nítido, links clicáveis e nenhuma biblioteca.
import { rest } from './supabase.js';
import { armazenamento, debounce, esc, formatarReais, icone, imagemProduto, mascararTelefone } from './util.js';
import { LOJA_PADRAO, aplicarCores, contraste, logoHtml, redesDaLoja } from './loja.js';
import { seloIdioma } from './idiomas.js';

const CHAVE_OPCOES = 'wpv_pdf_opcoes';
const OPCOES_PADRAO = {
  titulo: 'Catálogo de produtos',
  aviso: 'Preços e disponibilidade sujeitos a alteração. Consulte antes de comprar.',
  layout: 'grade', agrupar: 'categoria', ordem: 'nome',
  capa: true, precos: true, esgotados: true, descricao: true, codigo: false,
  semCategorias: [], semTemas: [],
};
const LAYOUTS = [
  { id: 'grade', nome: 'Vitrine', desc: '3 por linha, foto grande', blocos: 6 },
  { id: 'detalhado', nome: 'Detalhado', desc: '2 por linha, com descrição', blocos: 4 },
  { id: 'lista', nome: 'Lista de preços', desc: '1 por linha, compacto', blocos: 4 },
];
const SEM_TEMA = { id: 0, nome: 'Sem tema', cor: '#64748b' };
const MAX_SUMARIO = 12;

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
/** Texto branco ou escuro, o que tiver mais contraste com a cor de fundo. */
const textoSobre = (cor) => (contraste(cor, '#ffffff') >= contraste(cor, '#0f172a') ? '#ffffff' : '#0f172a');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function mesAno() {
  const s = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s[0].toUpperCase() + s.slice(1);
}

/** Texto mostrado ao lado do ícone de cada rede no PDF. */
function rotuloRede(r, loja) {
  if (r.rede === 'whatsapp') {
    const d = String(loja.whatsapp);
    return /^55\d{10,11}$/.test(d) ? mascararTelefone(d.slice(2)) : `+${d}`;
  }
  if (r.rotulo !== r.nome) return r.rotulo;
  return r.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
}

const ORDENAR = {
  nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  menor_preco: (a, b) => a.preco_centavos - b.preco_centavos || a.nome.localeCompare(b.nome, 'pt-BR'),
  maior_preco: (a, b) => b.preco_centavos - a.preco_centavos || a.nome.localeCompare(b.nome, 'pt-BR'),
  recentes: (a, b) => String(b.criado_em).localeCompare(String(a.criado_em)),
};

export async function vistaPdf(v) {
  const [lojas, categorias, temas, produtos] = await Promise.all([
    rest('loja?select=*&id=eq.1', { admin: true }),
    rest('categorias?select=id,nome,ordem&order=ordem,nome', { admin: true }),
    rest('temas?select=id,nome,cor,ordem&order=ordem,nome', { admin: true }),
    rest('produtos?select=*&ativo=eq.true', { admin: true }),
  ]);
  const loja = { ...LOJA_PADRAO, ...lojas[0] };
  const salvas = armazenamento.ler(CHAVE_OPCOES, {});
  const opcoes = { ...OPCOES_PADRAO, ...salvas };
  const catPorId = new Map(categorias.map((c) => [c.id, c]));
  const temaPorId = new Map([[0, SEM_TEMA], ...temas.map((t) => [t.id, t])]);
  const temaDe = (p) => temaPorId.get(p.tema_id ?? 0) || SEM_TEMA;
  const origem = location.origin;
  const host = location.host;

  const contar = (campo, id) => produtos.filter((p) => (p[campo] ?? 0) === id).length;
  const categoriasUsadas = categorias.filter((c) => contar('categoria_id', c.id) > 0);
  const temasUsados = [...temas, SEM_TEMA].filter((t) => contar('tema_id', t.id) > 0);
  const marcado = (lista, id) => (lista.includes(id) ? '' : 'checked');

  v.innerHTML = `
    <div class="cabecalho">
      <div><h1>Catálogo em PDF</h1><p>Um PDF com a cara da sua loja para mandar no WhatsApp, postar ou imprimir.</p></div>
      <button class="btn btn-marca" id="gerar-pdf">${icone('baixar')} Baixar PDF</button>
    </div>
    <div class="pdf-editor">
      <form class="pdf-opcoes" id="pdf-opcoes" novalidate>
        <section class="secao">
          <h2>Modelo</h2>
          <div class="pdf-layouts">
            ${LAYOUTS.map((l) => `
              <label class="pdf-layout">
                <input type="radio" name="layout" value="${l.id}" ${opcoes.layout === l.id ? 'checked' : ''}>
                <span class="pdf-desenho pdf-desenho-${l.id}" aria-hidden="true">${'<i></i>'.repeat(l.blocos)}</span>
                <strong>${l.nome}</strong><small>${l.desc}</small>
              </label>`).join('')}
          </div>
          <div class="grade-campos">
            <label class="campo"><span>Agrupar por</span>
              <select class="select" name="agrupar">
                <option value="categoria">Categoria</option><option value="tema">Tema</option><option value="nenhum">Não agrupar</option>
              </select></label>
            <label class="campo"><span>Ordenar por</span>
              <select class="select" name="ordem">
                <option value="nome">Nome (A–Z)</option><option value="menor_preco">Menor preço</option>
                <option value="maior_preco">Maior preço</option><option value="recentes">Mais recentes</option>
              </select></label>
          </div>
        </section>

        <section class="secao">
          <h2>Textos</h2>
          <label class="campo"><span>Título do catálogo</span>
            <input class="input" name="titulo" maxlength="60" value="${esc(opcoes.titulo)}"></label>
          <label class="campo"><span>Aviso no rodapé</span>
            <input class="input" name="aviso" maxlength="160" value="${esc(opcoes.aviso)}" placeholder="Opcional">
            <small>Ex.: validade dos preços, formas de pagamento, entrega.</small></label>
        </section>

        <section class="secao">
          <h2>Mostrar</h2>
          <div class="pdf-checks">
            <label class="interruptor"><input type="checkbox" name="capa" ${opcoes.capa ? 'checked' : ''}>Capa com logo, contatos e índice</label>
            <label class="interruptor"><input type="checkbox" name="precos" ${opcoes.precos ? 'checked' : ''}>Preços</label>
            <label class="interruptor"><input type="checkbox" name="esgotados" ${opcoes.esgotados ? 'checked' : ''}>Produtos esgotados</label>
            <label class="interruptor"><input type="checkbox" name="descricao" ${opcoes.descricao ? 'checked' : ''}>Descrição <small>(Detalhado e Lista)</small></label>
            <label class="interruptor"><input type="checkbox" name="codigo" ${opcoes.codigo ? 'checked' : ''}>Código de barras</label>
          </div>
        </section>

        <section class="secao">
          <h2>Quais produtos</h2>
          <fieldset class="pdf-filtro"><legend class="rotulo">Categorias</legend>
            ${categoriasUsadas.map((c) => `
              <label class="interruptor"><input type="checkbox" name="categoria" value="${c.id}" ${marcado(opcoes.semCategorias, c.id)}>
                ${esc(c.nome)}<small>${contar('categoria_id', c.id)}</small></label>`).join('') || '<p class="dica-campo">Nenhuma categoria com produtos.</p>'}
          </fieldset>
          <fieldset class="pdf-filtro"><legend class="rotulo">Temas</legend>
            ${temasUsados.map((t) => `
              <label class="interruptor"><input type="checkbox" name="tema" value="${t.id}" ${marcado(opcoes.semTemas, t.id)}>
                <span class="ponto-tema" style="--cor:${esc(t.cor)}"></span>${esc(t.nome)}<small>${contar('tema_id', t.id)}</small></label>`).join('')}
          </fieldset>
          <p class="dica-campo">Produtos ocultos nunca entram no PDF.</p>
        </section>
      </form>

      <div class="pdf-previa">
        <div class="pdf-resumo">
          <span id="pdf-resumo" role="status"></span>
          <span class="pdf-dica">${icone('documento')} Na janela que abrir, escolha <strong>Salvar como PDF</strong>.</span>
        </div>
        <div class="pdf-palco" id="pdf-palco"><div class="pdf-folhas" id="pdf-folhas"></div></div>
      </div>
    </div>`;

  const $v = (sel) => v.querySelector(sel);
  const form = $v('#pdf-opcoes');
  const folhas = $v('#pdf-folhas');
  const palco = $v('#pdf-palco');
  const botao = $v('#gerar-pdf');
  form.agrupar.value = opcoes.agrupar;
  form.ordem.value = opcoes.ordem;

  function lerForm() {
    const desmarcados = (nome) => [...form.querySelectorAll(`[name="${nome}"]:not(:checked)`)].map((i) => Number(i.value));
    return {
      titulo: form.titulo.value.trim() || OPCOES_PADRAO.titulo,
      aviso: form.aviso.value.trim(),
      layout: form.layout.value || 'grade',
      agrupar: form.agrupar.value,
      ordem: form.ordem.value,
      capa: form.capa.checked, precos: form.precos.checked, esgotados: form.esgotados.checked,
      descricao: form.descricao.checked, codigo: form.codigo.checked,
      semCategorias: desmarcados('categoria'), semTemas: desmarcados('tema'),
    };
  }

  function selecionar(o) {
    return produtos
      .filter((p) => !o.semCategorias.includes(p.categoria_id))
      .filter((p) => !o.semTemas.includes(p.tema_id ?? 0))
      .filter((p) => o.esgotados || p.estoque > 0 || p.pre_venda)
      .sort(ORDENAR[o.ordem] || ORDENAR.nome);
  }

  function agrupar(lista, o) {
    if (o.agrupar === 'tema') {
      return [...temas, SEM_TEMA]
        .map((t) => ({ nome: t.nome, cor: t.cor, produtos: lista.filter((p) => (p.tema_id ?? 0) === t.id) }))
        .filter((g) => g.produtos.length);
    }
    if (o.agrupar === 'categoria') {
      return categorias
        .map((c) => ({ nome: c.nome, cor: loja.cor_primaria, produtos: lista.filter((p) => p.categoria_id === c.id) }))
        .filter((g) => g.produtos.length);
    }
    return [{ nome: null, cor: loja.cor_primaria, produtos: lista }];
  }

  // ---------------------------------------------------------------- Peças do documento
  const redes = redesDaLoja(loja);
  const redesRodape = [
    ...redes.map((r) => `<a href="${esc(r.url)}">${icone(r.rede)}${esc(rotuloRede(r, loja))}</a>`),
    `<a href="${esc(origem)}/">${icone('loja')}${esc(host)}</a>`,
  ].join('');

  function cardHtml(p, o) {
    const tema = p.tema_id ? temaDe(p) : null;
    const cor = tema?.cor || loja.cor_primaria;
    const esgotado = p.estoque <= 0 && !p.pre_venda;
    const etiquetas = [
      tema && o.agrupar !== 'tema' ? `<span class="pdf-tema" style="background:${esc(cor)};color:${textoSobre(cor)}">${esc(tema.nome)}</span>` : '',
      seloIdioma(p.idioma, 'selo-idioma pdf-idioma'),
      o.agrupar !== 'categoria' ? `<span class="pdf-categoria">${esc(catPorId.get(p.categoria_id)?.nome || '')}</span>` : '',
    ].join('');
    return `
      <a class="pdf-card${esgotado ? ' esgotado' : ''}" href="${esc(origem)}/?produto=${p.id}" style="--tema:${esc(cor)}">
        <div class="pdf-card-foto">
          ${imagemProduto(p, 'pdf-foto').replace(' loading="lazy"', '')}
          ${esgotado ? '<span class="pdf-selo-esgotado">Esgotado</span>' : ''}
          ${p.pre_venda ? '<span class="pdf-selo-esgotado pdf-selo-pre-venda">Pré-venda</span>' : ''}
        </div>
        <div class="pdf-card-info">
          ${etiquetas ? `<div class="pdf-etiquetas">${etiquetas}</div>` : ''}
          <strong class="pdf-nome">${esc(p.nome)}</strong>
          ${p.conteudo ? `<span class="pdf-conteudo">${esc(p.conteudo)}</span>` : ''}
          ${o.descricao && p.descricao && o.layout !== 'grade' ? `<p class="pdf-desc">${esc(p.descricao)}</p>` : ''}
          ${o.codigo && p.codigo_barras ? `<span class="pdf-ean">EAN ${esc(p.codigo_barras)}</span>` : ''}
          ${o.precos ? `<span class="pdf-preco">${formatarReais(p.preco_centavos)}</span>` : ''}
        </div>
      </a>`;
  }

  const secaoHtml = (g, continuacao) => `
    <div class="pdf-secao" style="--sec:${esc(g.cor)};--sec-texto:${textoSobre(g.cor)}">
      <h2>${esc(g.nome)}${continuacao ? ' <small>(continuação)</small>' : ''}</h2>
      <span>${plural(g.produtos.length, 'produto', 'produtos')}</span>
    </div>`;

  const paginaHtml = (o) => `
    <section class="folha folha-produtos">
      <header class="folha-topo">
        <div class="folha-marca">${logoHtml(loja, 'logo folha-logo')}
          <div><strong>${esc(loja.nome)}</strong>${loja.slogan ? `<small>${esc(loja.slogan)}</small>` : ''}</div>
        </div>
        <span class="folha-titulo">${esc(o.titulo)}</span>
      </header>
      <div class="folha-conteudo"></div>
      <footer class="folha-rodape">
        <div class="folha-rodape-linha"><div class="folha-redes">${redesRodape}</div><span class="folha-num"></span></div>
        ${o.aviso ? `<p class="folha-aviso">${esc(o.aviso)}</p>` : ''}
      </footer>
    </section>`;

  function capaHtml(o, lista) {
    const usados = new Set(lista.map((p) => p.tema_id).filter(Boolean));
    const temasCapa = temas.filter((t) => usados.has(t.id));
    const contatos = [
      ...redes.map((r) => ({ url: r.url, icone: r.rede, nome: r.nome, rotulo: rotuloRede(r, loja) })),
      { url: `${origem}/`, icone: 'loja', nome: 'Catálogo online', rotulo: host },
    ];
    return `
      <section class="folha folha-capa">
        <div class="capa-topo">
          <div class="capa-logo">${logoHtml(loja, 'logo capa-logo-img')}</div>
          <h1 class="capa-nome">${esc(loja.nome)}</h1>
          ${loja.slogan ? `<p class="capa-slogan">${esc(loja.slogan)}</p>` : ''}
          <div class="capa-titulo"><strong>${esc(o.titulo)}</strong><span>${mesAno()} · ${plural(lista.length, 'produto', 'produtos')}</span></div>
        </div>
        ${temasCapa.length ? `<div class="capa-faixa">${temasCapa.map((t) => `<span style="background:${esc(t.cor)}"></span>`).join('')}</div>` : ''}
        <div class="capa-corpo">
          <div class="capa-bloco"><h2>Neste catálogo</h2><ol class="capa-sumario"></ol>
            ${temasCapa.length ? `
              <div class="capa-temas"><h2>Temas</h2>
                <div>${temasCapa.map((t) => `<span class="pdf-tema" style="background:${esc(t.cor)};color:${textoSobre(t.cor)}">${esc(t.nome)}</span>`).join('')}</div>
              </div>` : ''}
          </div>
          <div class="capa-bloco"><h2>Fale com a gente</h2>
            <ul class="capa-redes">
              ${contatos.map((c) => `
                <li><a href="${esc(c.url)}"><span class="capa-rede-icone">${icone(c.icone)}</span>
                  <span><small>${esc(c.nome)}</small><strong>${esc(c.rotulo)}</strong></span></a></li>`).join('')}
            </ul>
            <p class="capa-dica">Toque em qualquer produto deste PDF para ver os detalhes no catálogo online${loja.whatsapp ? ' e fazer o pedido pelo WhatsApp' : ''}.</p>
          </div>
        </div>
        ${o.aviso ? `<p class="capa-aviso">${esc(o.aviso)}</p>` : ''}
      </section>`;
  }

  function preencherSumario(capa, grupos, lista) {
    // Sem agrupamento, o índice lista as categorias (sem página).
    const itens = grupos[0]?.nome
      ? grupos
      : categorias.map((c) => ({ nome: c.nome, cor: loja.cor_primaria, produtos: lista.filter((p) => p.categoria_id === c.id) }))
        .filter((g) => g.produtos.length);
    const visiveis = itens.slice(0, MAX_SUMARIO);
    capa.querySelector('.capa-sumario').innerHTML = visiveis.map((g) => `
      <li style="--c:${esc(g.cor)}">
        <span class="capa-ponto"></span><span class="capa-sec">${esc(g.nome)}</span>
        <span class="capa-qtd">${g.produtos.length}</span><span class="capa-pontilhado"></span>
        ${g.pagina ? `<span class="capa-pag">p. ${g.pagina}</span>` : ''}
      </li>`).join('')
      + (itens.length > visiveis.length ? `<li class="capa-mais">e mais ${plural(itens.length - visiveis.length, 'seção', 'seções')}</li>` : '');
  }

  // ---------------------------------------------------------------- Montagem e paginação
  let total = 0;
  function montar() {
    const o = lerForm();
    armazenamento.gravar(CHAVE_OPCOES, o);
    const lista = selecionar(o);
    folhas.className = `pdf-folhas layout-${o.layout}`;
    folhas.innerHTML = '';
    aplicarCores(loja.cor_primaria, folhas);

    if (!lista.length) {
      total = 0;
      folhas.innerHTML = '<div class="pdf-vazio"><strong>Nenhum produto com essas opções</strong>Marque ao menos uma categoria e um tema.</div>';
      $v('#pdf-resumo').textContent = 'Nada para gerar.';
      botao.disabled = true;
      ajustarEscala();
      return;
    }

    const grupos = agrupar(lista, o);
    const capa = o.capa ? el(capaHtml(o, lista)) : null;
    if (capa) folhas.append(capa);
    const extra = capa ? 1 : 0;
    const paginas = [];
    let conteudo;
    const novaPagina = () => {
      const folha = el(paginaHtml(o));
      folhas.append(folha);
      paginas.push(folha);
      conteudo = folha.querySelector('.folha-conteudo');
    };
    const cabe = () => conteudo.scrollHeight <= conteudo.clientHeight + 1;

    novaPagina();
    for (const g of grupos) {
      let titulo = null;
      let grade;
      const abrirSecao = (continuacao) => {
        titulo = g.nome ? el(secaoHtml(g, continuacao)) : null;
        if (titulo) conteudo.append(titulo);
        grade = el('<div class="pdf-grade"></div>');
        conteudo.append(grade);
      };
      abrirSecao(false);
      g.pagina = paginas.length + extra;

      g.produtos.forEach((p, i) => {
        const card = el(cardHtml(p, o));
        grade.append(card);
        if (cabe()) return;
        card.remove();
        if (i === 0) {
          // Título sozinho no pé da página: leva a seção inteira para a próxima.
          titulo?.remove();
          grade.remove();
          novaPagina();
          abrirSecao(false);
          g.pagina = paginas.length + extra;
        } else {
          novaPagina();
          abrirSecao(true);
        }
        grade.append(card);
      });
    }

    total = paginas.length + extra;
    paginas.forEach((folha, i) => { folha.querySelector('.folha-num').textContent = `${i + 1 + extra} / ${total}`; });
    if (capa) preencherSumario(capa, grupos, lista);
    $v('#pdf-resumo').textContent = `${plural(total, 'página', 'páginas')} · ${plural(lista.length, 'produto', 'produtos')}`;
    botao.disabled = false;
    ajustarEscala();
  }

  // A pré-visualização é a própria folha A4 reduzida para caber na tela.
  function ajustarEscala() {
    const escala = Math.min(1, palco.clientWidth / folhas.offsetWidth);
    folhas.style.transform = `scale(${escala})`;
    palco.style.height = `${Math.ceil(folhas.offsetHeight * escala)}px`;
  }
  const observador = new ResizeObserver(() => {
    if (!palco.isConnected) { observador.disconnect(); return; }
    ajustarEscala();
  });
  observador.observe(palco);

  const remontar = debounce(montar, 200);
  form.addEventListener('input', remontar);
  form.addEventListener('change', remontar);
  form.addEventListener('submit', (e) => e.preventDefault());

  // ---------------------------------------------------------------- Gerar
  botao.addEventListener('click', async () => {
    montar();
    if (!total) return;
    botao.disabled = true;
    const rotulo = botao.innerHTML;
    botao.textContent = 'Preparando imagens…';
    await Promise.all([...folhas.querySelectorAll('img')].map((img) => (img.complete ? null
      : new Promise((pronto) => { img.addEventListener('load', pronto, { once: true }); img.addEventListener('error', pronto, { once: true }); }))));
    botao.disabled = false;
    botao.innerHTML = rotulo;

    // O título da página vira o nome sugerido do arquivo.
    const tituloAntes = document.title;
    const data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    document.title = `${lerForm().titulo} - ${loja.nome} - ${data}`;
    window.addEventListener('afterprint', () => { document.title = tituloAntes; }, { once: true });
    window.print();
  });

  montar();
}
