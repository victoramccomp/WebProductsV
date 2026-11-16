// Painel › Produtos: tabela com busca/ordenação/filtros e formulário de cadastro/edição (CRUD).
import { rest, storage } from './supabase.js';
import { avisar, debounce, esc, formatarReais, icone, imagemProduto, semAcento } from './util.js';
import {
  abrirModal, centavosParaTexto, confirmar, fecharModal, gtinValido, reaisParaCentavos, redimensionarImagem,
} from './admin-ui.js';
import { IDIOMAS, IDIOMA_PADRAO, bandeira, idiomaDe, seloIdioma } from './idiomas.js';

let produtos = [];
let categorias = [];
let temas = [];
const filtro = { busca: '', categoria: '', tema: '', idioma: '', ordem: 'nome', direcao: 1 };

const COLUNAS = [
  { chave: 'nome', titulo: 'Produto' },
  { chave: 'codigo_barras', titulo: 'Código' },
  { chave: 'categoria', titulo: 'Categoria / tema' },
  { chave: 'preco_centavos', titulo: 'Preço', num: true },
  { chave: 'estoque', titulo: 'Estoque', num: true },
];

// Cores sugeridas para temas novos (o lojista pode trocar em "Categorias e temas").
export const CORES_TEMA = ['#e3350d', '#7c3aed', '#2563eb', '#16a34a', '#d97706', '#db2777', '#0891b2', '#475569'];

export async function vistaProdutos(vista) {
  vista.innerHTML = `
    <div class="cabecalho">
      <div><h1>Produtos</h1><p>Cadastre, edite e controle o estoque do catálogo.</p></div>
      <div class="cabecalho-acoes">
        <a class="btn" href="#/pdf">${icone('documento')} Catálogo em PDF</a>
        <button class="btn btn-primario" id="novo-produto">${icone('mais')} Novo produto</button>
      </div>
    </div>
    <div class="indicadores" id="indicadores"></div>
    <div class="ferramentas">
      <label class="busca-admin">
        <span class="sr-only">Buscar produtos</span>
        ${icone('busca')}
        <input class="input" type="search" id="busca-produtos" placeholder="Buscar por nome, código ou descrição" value="${esc(filtro.busca)}">
      </label>
      <label><span class="sr-only">Filtrar por categoria</span><select class="select" id="filtro-categoria"></select></label>
      <label><span class="sr-only">Filtrar por tema</span><select class="select" id="filtro-tema"></select></label>
      <label><span class="sr-only">Filtrar por idioma</span><select class="select" id="filtro-idioma"></select></label>
    </div>
    <div class="tabela-caixa"><div class="carregando">Carregando…</div></div>`;

  vista.querySelector('#novo-produto').addEventListener('click', () => abrirFormulario(null, recarregar));
  vista.querySelector('#busca-produtos').addEventListener('input', debounce((e) => { filtro.busca = e.target.value; renderizarTabela(vista); }, 150));
  vista.querySelector('#filtro-categoria').addEventListener('change', (e) => { filtro.categoria = e.target.value; renderizarTabela(vista); });
  vista.querySelector('#filtro-tema').addEventListener('change', (e) => { filtro.tema = e.target.value; renderizarTabela(vista); });
  vista.querySelector('#filtro-idioma').addEventListener('change', (e) => { filtro.idioma = e.target.value; renderizarTabela(vista); });

  vista.querySelector('.tabela-caixa').addEventListener('click', (e) => {
    const ordenar = e.target.closest('[data-ordenar]');
    if (ordenar) {
      const chave = ordenar.dataset.ordenar;
      filtro.direcao = filtro.ordem === chave ? -filtro.direcao : 1;
      filtro.ordem = chave;
      return renderizarTabela(vista);
    }
    const linha = e.target.closest('tr[data-id]');
    if (!linha) return;
    const produto = produtos.find((p) => p.id === Number(linha.dataset.id));
    if (e.target.closest('[data-excluir]')) return excluirProduto(produto, recarregar);
    abrirFormulario(produto, recarregar);
  });

  async function recarregar() {
    const [lista, cats, tms] = await Promise.all([
      rest('produtos?select=*&order=nome', { admin: true }),
      rest('categorias?select=id,nome,ordem&order=ordem,nome', { admin: true }),
      rest('temas?select=id,nome,cor,ordem&order=ordem,nome', { admin: true }),
    ]);
    categorias = cats;
    temas = tms;
    const nomeCat = new Map(cats.map((c) => [c.id, c.nome]));
    const tema = new Map(tms.map((t) => [t.id, t]));
    produtos = lista.map((p) => ({
      ...p, idioma: idiomaDe(p.idioma).codigo, categoria: nomeCat.get(p.categoria_id) || '', tema: tema.get(p.tema_id) || null,
    }));
    renderizarIndicadores(vista);
    renderizarFiltros(vista);
    renderizarTabela(vista);
  }
  await recarregar();
}

function renderizarIndicadores(vista) {
  const semEstoque = produtos.filter((p) => p.estoque === 0).length;
  const ocultos = produtos.filter((p) => !p.ativo).length;
  vista.querySelector('#indicadores').innerHTML = `
    <div class="indicador"><span>Produtos</span><strong>${produtos.length}</strong></div>
    <div class="indicador${semEstoque ? ' alerta' : ''}"><span>Sem estoque</span><strong>${semEstoque}</strong></div>
    <div class="indicador"><span>Ocultos do catálogo</span><strong>${ocultos}</strong></div>
    <div class="indicador"><span>Categorias / temas</span><strong>${categorias.length} / ${temas.length}</strong></div>`;
}

function renderizarFiltros(vista) {
  vista.querySelector('#filtro-categoria').innerHTML = `<option value="">Todas as categorias</option>${categorias.map((c) =>
    `<option value="${c.id}" ${String(c.id) === filtro.categoria ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}`;
  vista.querySelector('#filtro-tema').innerHTML = `<option value="">Todos os temas</option><option value="sem" ${filtro.tema === 'sem' ? 'selected' : ''}>Sem tema</option>${temas.map((t) =>
    `<option value="${t.id}" ${String(t.id) === filtro.tema ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}`;
  // Só os idiomas que têm produto cadastrado.
  const usados = IDIOMAS.filter((i) => produtos.some((p) => p.idioma === i.codigo));
  if (filtro.idioma && !usados.some((i) => i.codigo === filtro.idioma)) filtro.idioma = '';
  vista.querySelector('#filtro-idioma').innerHTML = `<option value="">Todos os idiomas</option>${usados.map((i) =>
    `<option value="${i.codigo}" ${i.codigo === filtro.idioma ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')}`;
}

function renderizarTabela(vista) {
  const termos = semAcento(filtro.busca).split(/\s+/).filter(Boolean);
  const lista = produtos
    .filter((p) => !filtro.categoria || String(p.categoria_id) === filtro.categoria)
    .filter((p) => !filtro.tema || (filtro.tema === 'sem' ? !p.tema_id : String(p.tema_id) === filtro.tema))
    .filter((p) => !filtro.idioma || p.idioma === filtro.idioma)
    .filter((p) => {
      const alvo = semAcento(`${p.nome} ${p.descricao} ${p.conteudo} ${p.codigo_barras || ''} ${idiomaDe(p.idioma).nome}`);
      return termos.every((t) => alvo.includes(t));
    })
    .sort((a, b) => {
      const va = a[filtro.ordem] ?? '';
      const vb = b[filtro.ordem] ?? '';
      const r = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
      return r * filtro.direcao;
    });

  const caixa = vista.querySelector('.tabela-caixa');
  if (!produtos.length) {
    caixa.innerHTML = `<div class="vazio"><strong>Nenhum produto cadastrado</strong>
      ${categorias.length ? 'Clique em “Novo produto” para começar.' : 'Comece criando uma categoria em “Categorias e temas” — ou crie direto no formulário do produto.'}</div>`;
    return;
  }
  const cabecalho = COLUNAS.map((c) => {
    const ativa = filtro.ordem === c.chave;
    const sort = ativa ? `aria-sort="${filtro.direcao === 1 ? 'ascending' : 'descending'}"` : '';
    return `<th class="${c.num ? 'num' : ''}" ${sort}><button type="button" data-ordenar="${c.chave}">${c.titulo}
      <span class="seta-ordem" aria-hidden="true">${ativa ? (filtro.direcao === 1 ? '▲' : '▼') : ''}</span></button></th>`;
  }).join('');

  caixa.innerHTML = `
    <table class="tabela">
      <thead><tr><th><span class="sr-only">Imagem</span></th>${cabecalho}<th><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>
        ${lista.map((p) => `
          <tr class="clicavel${p.ativo ? '' : ' inativo'}" data-id="${p.id}">
            <td><div class="miniatura">${imagemProduto(p)}</div></td>
            <td><strong>${esc(p.nome)}</strong>${p.ativo ? '' : ' <span class="selo">Oculto</span>'}
              <span class="sub linha-idioma">${seloIdioma(p.idioma)}${esc(p.conteudo)}</span></td>
            <td class="mono">${esc(p.codigo_barras || '—')}</td>
            <td>${esc(p.categoria)}<span class="sub">${p.tema ? `<span class="ponto-tema" style="--cor:${esc(p.tema.cor)}"></span>${esc(p.tema.nome)}` : 'Sem tema'}</span></td>
            <td class="num">${formatarReais(p.preco_centavos)}</td>
            <td class="num ${p.estoque === 0 ? 'estoque-zero' : p.estoque <= 3 ? 'estoque-baixo' : ''}">${p.estoque}</td>
            <td class="acoes">
              <button class="btn btn-fantasma btn-icone" type="button" aria-label="Editar ${esc(p.nome)}">${icone('editar')}</button>
              <button class="btn btn-fantasma btn-icone btn-perigo" type="button" data-excluir aria-label="Excluir ${esc(p.nome)}">${icone('lixo')}</button>
            </td>
          </tr>`).join('') || '<tr><td colspan="7"><div class="vazio">Nenhum produto corresponde à busca.</div></td></tr>'}
      </tbody>
    </table>`;
}

async function excluirProduto(produto, depois) {
  const ok = await confirmar({
    titulo: 'Excluir produto',
    mensagem: `Excluir “${produto.nome}” do catálogo? Isso não pode ser desfeito. Para só esconder, desmarque “Visível no catálogo”.`,
    botao: 'Excluir', perigo: true,
  });
  if (!ok) return;
  try {
    await rest(`produtos?id=eq.${produto.id}`, { metodo: 'DELETE', admin: true });
    await storage.apagar(produto.imagem);
    avisar('Produto excluído.');
    fecharModal();
    await depois();
  } catch (erro) { avisar(erro.message, 'erro'); }
}

// ---------------------------------------------------------------- Formulário
const SUGESTOES_CONTEUDO = ['Unidade', 'Caixa', 'Pacote com 3', 'Blister', 'Display com 36 boosters', '500 ml', '1 kg', 'Kit com 10 unidades'];

function abrirFormulario(produto, depois) {
  const editando = !!produto;
  const p = produto || {
    nome: '', descricao: '', conteudo: '', codigo_barras: '', preco_centavos: 0, estoque: 0,
    categoria_id: categorias.length === 1 ? categorias[0].id : '', tema_id: '', imagem: '', ativo: true,
    idioma: IDIOMA_PADRAO,
  };
  // imagem: '' | URL já salva | { blob, previa } (arquivo novo, enviado só ao salvar)
  let imagem = p.imagem || '';
  let modoImagem = imagem && !storage.ehImagemNossa(imagem) ? 'url' : 'arquivo';
  const srcImagem = () => (typeof imagem === 'object' ? imagem.previa : imagem);

  const m = abrirModal({
    titulo: editando ? 'Editar produto' : 'Novo produto',
    corpo: `
      <form class="form-produto" id="form-produto" novalidate>
        <div class="imagem-campo">
          <span class="rotulo">Imagem</span>
          <div class="imagem-previa" id="previa" tabindex="0" role="button" aria-label="Escolher imagem"></div>
          <div class="alternar" role="group" aria-label="Origem da imagem">
            <button type="button" data-modo="arquivo">Enviar arquivo</button>
            <button type="button" data-modo="url">Usar URL</button>
          </div>
          <input type="file" id="arquivo-imagem" accept="image/jpeg,image/png,image/webp" hidden>
          <input class="input" id="url-imagem" type="url" placeholder="https://…/foto.jpg" hidden>
          <button class="btn btn-pequeno btn-perigo" type="button" id="remover-imagem">Remover imagem</button>
        </div>

        <div class="grade-campos">
          <label class="campo largo"><span class="obrigatorio">Nome</span>
            <input class="input" name="nome" required maxlength="160" value="${esc(p.nome)}">
          </label>
          <label class="campo largo"><span>Descrição</span>
            <textarea class="textarea" name="descricao" maxlength="4000" rows="3">${esc(p.descricao)}</textarea>
          </label>
          <label class="campo"><span>Conteúdo</span>
            <input class="input" name="conteudo" maxlength="80" list="sugestoes-conteudo" placeholder="Ex.: Unidade, 500 ml, Caixa com 10" value="${esc(p.conteudo)}">
            <datalist id="sugestoes-conteudo">${SUGESTOES_CONTEUDO.map((s) => `<option value="${s}">`).join('')}</datalist>
          </label>
          <label class="campo"><span>Código de barras (EAN/GTIN)</span>
            <input class="input" name="codigo_barras" inputmode="numeric" maxlength="14" placeholder="7891234567895" value="${esc(p.codigo_barras || '')}">
            <span class="dica-campo" id="dica-gtin"></span>
          </label>
          <label class="campo"><span class="obrigatorio">Preço</span>
            <div class="prefixo"><span>R$</span>
              <input class="input" name="preco" inputmode="decimal" required placeholder="0,00" value="${editando ? centavosParaTexto(p.preco_centavos) : ''}">
            </div>
          </label>
          <label class="campo"><span class="obrigatorio">Quantidade disponível</span>
            <input class="input" name="estoque" type="number" min="0" step="1" required value="${p.estoque}">
          </label>
          <div class="campo">
            <label class="obrigatorio rotulo" for="categoria">Categoria</label>
            <div class="selecao-com-botao">
              <select class="select" id="categoria" name="categoria_id" required></select>
              <button class="btn btn-icone" type="button" data-nova="categoria" aria-label="Nova categoria" title="Nova categoria">${icone('mais')}</button>
            </div>
            <div class="nova-opcao" id="nova-categoria" hidden>
              <input class="input" placeholder="Nome da nova categoria" maxlength="60">
              <button class="btn btn-primario" type="button">Criar</button>
            </div>
          </div>
          <div class="campo">
            <label class="rotulo" for="tema">Tema</label>
            <div class="selecao-com-botao">
              <select class="select" id="tema" name="tema_id"></select>
              <button class="btn btn-icone" type="button" data-nova="tema" aria-label="Novo tema" title="Novo tema">${icone('mais')}</button>
            </div>
            <div class="nova-opcao" id="nova-tema" hidden>
              <input class="input" placeholder="Nome do novo tema" maxlength="60">
              <button class="btn btn-primario" type="button">Criar</button>
            </div>
          </div>
          <fieldset class="campo largo campo-idioma">
            <legend class="rotulo obrigatorio">Idioma</legend>
            <div class="idiomas-opcoes">
              ${IDIOMAS.map((i) => `
                <label class="idioma-opcao" title="${esc(i.nome)}">
                  <input type="radio" name="idioma" value="${i.codigo}" ${i.codigo === idiomaDe(p.idioma).codigo ? 'checked' : ''}>
                  ${bandeira(i.codigo)}<span>${esc(i.curto)}</span>
                </label>`).join('')}
            </div>
          </fieldset>
          <label class="interruptor largo">
            <input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Visível no catálogo
          </label>
        </div>
      </form>`,
    rodape: `
      ${editando ? `<button class="btn btn-perigo esquerda" type="button" id="excluir">${icone('lixo')} Excluir</button>` : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primario" type="submit" form="form-produto" id="salvar">${editando ? 'Salvar alterações' : 'Cadastrar produto'}</button>`,
    aoFechar: () => { if (typeof imagem === 'object') URL.revokeObjectURL(imagem.previa); },
  });

  const form = m.querySelector('#form-produto');
  const $m = (sel) => m.querySelector(sel);

  // ---- Imagem
  function desenharImagem() {
    const previa = $m('#previa');
    const src = srcImagem();
    previa.classList.toggle('tem-imagem', !!src);
    previa.innerHTML = src
      ? `<img src="${esc(src)}" alt="Prévia da imagem">`
      : `<div class="dica">${icone('imagem')}<span>${modoImagem === 'url' ? 'Cole a URL abaixo' : 'Clique ou arraste uma imagem'}</span></div>`;
    m.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.modo === modoImagem));
    $m('#url-imagem').hidden = modoImagem !== 'url';
    if (modoImagem === 'url' && typeof imagem === 'string' && !storage.ehImagemNossa(imagem)) $m('#url-imagem').value = imagem;
    $m('#remover-imagem').hidden = !src;
  }
  function trocarImagem(nova) {
    if (typeof imagem === 'object') URL.revokeObjectURL(imagem.previa);
    imagem = nova;
    desenharImagem();
  }
  async function usarArquivo(arquivo) {
    if (!arquivo) return;
    try {
      const blob = await redimensionarImagem(arquivo);
      modoImagem = 'arquivo';
      trocarImagem({ blob, previa: URL.createObjectURL(blob) });
    } catch (erro) { avisar(erro.message, 'erro'); }
  }
  const escolherArquivo = () => { if (modoImagem === 'arquivo') $m('#arquivo-imagem').click(); };
  $m('#previa').addEventListener('click', escolherArquivo);
  $m('#previa').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolherArquivo(); } });
  $m('#arquivo-imagem').addEventListener('change', (e) => usarArquivo(e.target.files[0]));
  $m('#previa').addEventListener('dragover', (e) => { e.preventDefault(); $m('#previa').classList.add('arrastando'); });
  $m('#previa').addEventListener('dragleave', () => $m('#previa').classList.remove('arrastando'));
  $m('#previa').addEventListener('drop', (e) => { e.preventDefault(); $m('#previa').classList.remove('arrastando'); usarArquivo(e.dataTransfer.files[0]); });
  m.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modoImagem = b.dataset.modo; desenharImagem(); }));
  $m('#url-imagem').addEventListener('input', debounce((e) => trocarImagem(e.target.value.trim()), 400));
  $m('#remover-imagem').addEventListener('click', () => { $m('#url-imagem').value = ''; $m('#arquivo-imagem').value = ''; trocarImagem(''); });
  desenharImagem();

  // ---- Código de barras: confere o dígito verificador (só alerta; códigos internos são aceitos)
  function conferirGtin() {
    const codigo = form.codigo_barras.value.replace(/\D/g, '');
    form.codigo_barras.value = codigo;
    const dica = $m('#dica-gtin');
    dica.className = 'dica-campo';
    if (!codigo) { dica.textContent = ''; return; }
    if (codigo.length < 8) { dica.textContent = 'Use de 8 a 14 dígitos.'; return; }
    const valido = gtinValido(codigo);
    dica.textContent = valido ? 'Dígito verificador válido.' : 'Dígito verificador não confere (confira, ou use como código interno).';
    dica.classList.add(valido ? 'ok' : 'alerta');
  }
  form.codigo_barras.addEventListener('input', conferirGtin);
  conferirGtin();

  // ---- Categoria e tema (com cadastro rápido)
  function preencherCategorias(selecionada) {
    $m('#categoria').innerHTML = `<option value="">Selecione…</option>${categorias.map((c) =>
      `<option value="${c.id}" ${c.id === Number(selecionada) ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}`;
  }
  function preencherTemas(selecionado) {
    $m('#tema').innerHTML = `<option value="">Sem tema</option>${temas.map((t) =>
      `<option value="${t.id}" ${t.id === Number(selecionado) ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}`;
  }
  preencherCategorias(p.categoria_id);
  preencherTemas(p.tema_id);

  m.querySelectorAll('[data-nova]').forEach((botao) => botao.addEventListener('click', () => {
    const caixa = $m(`#nova-${botao.dataset.nova}`);
    caixa.hidden = !caixa.hidden;
    if (!caixa.hidden) caixa.querySelector('input').focus();
  }));
  async function criarOpcao(tipo) {
    const caixa = $m(`#nova-${tipo}`);
    const input = caixa.querySelector('input');
    const nome = input.value.trim();
    if (nome.length < 2) return avisar('Digite um nome com pelo menos 2 letras.', 'erro');
    try {
      if (tipo === 'categoria') {
        const [nova] = await rest('categorias?select=id,nome,ordem', {
          metodo: 'POST', admin: true, prefer: 'return=representation',
          corpo: { nome, ordem: categorias.length + 1 },
          mensagens: { 23505: 'Já existe uma categoria com esse nome.' },
        });
        categorias.push(nova);
        preencherCategorias(nova.id);
      } else {
        const [novo] = await rest('temas?select=id,nome,cor,ordem', {
          metodo: 'POST', admin: true, prefer: 'return=representation',
          corpo: { nome, cor: CORES_TEMA[temas.length % CORES_TEMA.length], ordem: temas.length + 1 },
          mensagens: { 23505: 'Já existe um tema com esse nome.' },
        });
        temas.push(novo);
        preencherTemas(novo.id);
      }
      input.value = '';
      caixa.hidden = true;
      avisar(`${tipo === 'categoria' ? 'Categoria' : 'Tema'} “${nome}” criado.`);
    } catch (erro) { avisar(erro.message, 'erro'); }
  }
  ['categoria', 'tema'].forEach((tipo) => {
    const caixa = $m(`#nova-${tipo}`);
    caixa.querySelector('button').addEventListener('click', () => criarOpcao(tipo));
    caixa.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); criarOpcao(tipo); } });
  });

  // ---- Salvar
  $m('#excluir')?.addEventListener('click', () => excluirProduto(produto, depois));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const preco = reaisParaCentavos(form.preco.value);
    const estoque = Number(form.estoque.value);
    const url = typeof imagem === 'string' ? imagem : '';
    const problemas = [
      [form.nome, form.nome.value.trim().length < 2, 'Informe o nome do produto.'],
      [form.preco, Number.isNaN(preco), 'Informe um preço válido (ex.: 12,90).'],
      [form.estoque, form.estoque.value === '' || !Number.isInteger(estoque) || estoque < 0, 'A quantidade deve ser um número inteiro (0 ou mais).'],
      [form.categoria_id, !form.categoria_id.value, 'Escolha uma categoria.'],
      [$m('#url-imagem'), url !== '' && !/^https?:\/\//i.test(url), 'A URL da imagem deve começar com http:// ou https://'],
    ];
    problemas.forEach(([campo, invalido]) => campo.setAttribute('aria-invalid', invalido));
    const primeiro = problemas.find(([, invalido]) => invalido);
    if (primeiro) { avisar(primeiro[2], 'erro'); primeiro[0].focus(); return; }

    const botao = $m('#salvar');
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    let enviada = '';
    try {
      // O arquivo novo só é enviado agora; se salvar falhar, ele é apagado em seguida.
      if (typeof imagem === 'object') {
        botao.textContent = 'Enviando imagem…';
        enviada = await storage.enviar(imagem.blob, 'produtos');
      }
      const dados = {
        nome: form.nome.value.trim(), descricao: form.descricao.value.trim(), conteudo: form.conteudo.value.trim(),
        codigo_barras: form.codigo_barras.value || null, preco_centavos: preco, estoque,
        categoria_id: Number(form.categoria_id.value), tema_id: Number(form.tema_id.value) || null,
        imagem: enviada || url, ativo: form.ativo.checked, idioma: form.idioma.value || IDIOMA_PADRAO,
      };
      await rest(editando ? `produtos?id=eq.${produto.id}` : 'produtos', {
        metodo: editando ? 'PATCH' : 'POST', corpo: dados, admin: true, prefer: 'return=minimal',
      });
      if (editando && produto.imagem !== dados.imagem) await storage.apagar(produto.imagem);
      avisar(editando ? 'Produto atualizado.' : 'Produto cadastrado.');
      fecharModal();
      await depois();
    } catch (erro) {
      if (enviada) await storage.apagar(enviada);
      avisar(erro.message, 'erro');
      botao.disabled = false;
      botao.textContent = editando ? 'Salvar alterações' : 'Cadastrar produto';
    }
  });
  form.nome.focus();
}
