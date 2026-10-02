// Painel › Produtos: tabela com busca/ordenação e formulário de cadastro/edição (CRUD).
import { api, avisar, esc, formatarReais, icone, imagemProduto, debounce } from './util.js';
import {
  abrirModal, fecharModal, confirmar, reaisParaCentavos, centavosParaTexto, gtinValido,
} from './admin-ui.js';

let produtos = [];
let categorias = [];
const filtro = { busca: '', categoria: '', ordem: 'nome', direcao: 1 };

const COLUNAS = [
  { chave: 'nome', titulo: 'Produto' },
  { chave: 'codigo_barras', titulo: 'Código' },
  { chave: 'categoria', titulo: 'Categoria' },
  { chave: 'preco_centavos', titulo: 'Preço', num: true },
  { chave: 'estoque', titulo: 'Estoque', num: true },
];

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function vistaProdutos(vista, { atualizarResumo }) {
  vista.innerHTML = `
    <div class="cabecalho">
      <div><h1>Produtos</h1><p>Cadastre, edite e controle o estoque do catálogo.</p></div>
      <button class="btn btn-primario" id="novo-produto">${icone('mais')} Novo produto</button>
    </div>
    <div class="indicadores" id="indicadores"></div>
    <div class="ferramentas">
      <label class="busca-admin">
        <span class="sr-only">Buscar produtos</span>
        ${icone('busca')}
        <input class="input" type="search" id="busca-produtos" placeholder="Buscar por nome, código ou descrição" value="${esc(filtro.busca)}">
      </label>
      <label><span class="sr-only">Filtrar por categoria</span>
        <select class="select" id="filtro-categoria"><option value="">Todas as categorias</option></select>
      </label>
    </div>
    <div class="tabela-caixa"><div class="carregando">Carregando…</div></div>`;

  vista.querySelector('#novo-produto').addEventListener('click', () => abrirFormulario(null, recarregar));
  vista.querySelector('#busca-produtos').addEventListener('input', debounce((e) => { filtro.busca = e.target.value; renderizarTabela(vista); }, 150));
  vista.querySelector('#filtro-categoria').addEventListener('change', (e) => { filtro.categoria = e.target.value; renderizarTabela(vista); });

  vista.querySelector('.tabela-caixa').addEventListener('click', async (e) => {
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
    try {
      const [lista, cats, resumo] = await Promise.all([
        api('/api/admin/produtos'), api('/api/admin/categorias'), api('/api/admin/resumo'),
      ]);
      produtos = lista;
      categorias = cats;
      renderizarIndicadores(vista, resumo);
      renderizarFiltroCategorias(vista);
      renderizarTabela(vista);
      atualizarResumo(resumo);
    } catch (erro) {
      if (erro.status === 401) throw erro; // o painel volta para a tela de login
      vista.querySelector('.tabela-caixa').innerHTML = `<div class="vazio">${esc(erro.message)}</div>`;
    }
  }
  await recarregar();
}

function renderizarIndicadores(vista, r) {
  vista.querySelector('#indicadores').innerHTML = `
    <div class="indicador"><span>Produtos</span><strong>${r.produtos}</strong></div>
    <div class="indicador${r.sem_estoque ? ' alerta' : ''}"><span>Sem estoque</span><strong>${r.sem_estoque}</strong></div>
    <div class="indicador"><span>Categorias</span><strong>${r.categorias}</strong></div>
    <div class="indicador${r.pedidos_pendentes ? ' alerta' : ''}"><span>Pedidos pendentes</span><strong>${r.pedidos_pendentes}</strong></div>`;
}

function renderizarFiltroCategorias(vista) {
  const select = vista.querySelector('#filtro-categoria');
  select.innerHTML = `<option value="">Todas as categorias</option>${categorias.map((c) =>
    `<option value="${c.id}" ${String(c.id) === filtro.categoria ? 'selected' : ''}>${esc(c.nome)} (${c.total})</option>`).join('')}`;
}

function renderizarTabela(vista) {
  const termos = semAcento(filtro.busca).split(/\s+/).filter(Boolean);
  const lista = produtos
    .filter((p) => !filtro.categoria || String(p.categoria_id) === filtro.categoria)
    .filter((p) => {
      const alvo = semAcento(`${p.nome} ${p.descricao} ${p.conteudo} ${p.codigo_barras || ''}`);
      return termos.every((t) => alvo.includes(t));
    })
    .sort((a, b) => {
      const va = a[filtro.ordem] ?? '';
      const vb = b[filtro.ordem] ?? '';
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
      return r * filtro.direcao;
    });

  const caixa = vista.querySelector('.tabela-caixa');
  if (!produtos.length) {
    caixa.innerHTML = `<div class="vazio"><strong>Nenhum produto cadastrado</strong>Clique em “Novo produto” para começar.</div>`;
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
            <td><strong>${esc(p.nome)}</strong>${p.ativo ? '' : ' <span class="selo">Oculto</span>'}<span class="sub">${esc(p.conteudo)}</span></td>
            <td class="mono">${esc(p.codigo_barras || '—')}</td>
            <td>${esc(p.categoria)}<span class="sub">${esc(p.subcategoria || '')}</span></td>
            <td class="num">${formatarReais(p.preco_centavos)}</td>
            <td class="num ${p.estoque === 0 ? 'estoque-zero' : p.estoque <= 5 ? 'estoque-baixo' : ''}">${p.estoque}</td>
            <td class="acoes">
              <button class="btn btn-fantasma btn-icone" type="button" aria-label="Editar ${esc(p.nome)}">${icone('editar')}</button>
              <button class="btn btn-fantasma btn-icone btn-perigo" type="button" data-excluir aria-label="Excluir ${esc(p.nome)}">${icone('lixo')}</button>
            </td>
          </tr>`).join('') || `<tr><td colspan="7"><div class="vazio">Nenhum produto corresponde à busca.</div></td></tr>`}
      </tbody>
    </table>`;
}

async function excluirProduto(produto, depois) {
  const ok = await confirmar({
    titulo: 'Excluir produto',
    mensagem: `Excluir “${produto.nome}”? Pedidos antigos mantêm o nome e o preço registrados.`,
    botao: 'Excluir', perigo: true,
  });
  if (!ok) return;
  try {
    await api(`/api/admin/produtos/${produto.id}`, { metodo: 'DELETE' });
    avisar('Produto excluído.');
    fecharModal();
    depois();
  } catch (erro) { avisar(erro.message, 'erro'); }
}

// ---------------------------------------------------------------- Formulário
const SUGESTOES_CONTEUDO = ['Unidade', '500ml', '1 L', '2 L', 'Lata 350ml', '500 g', '1 kg', '5 kg', 'Caixa com 10 unidades', 'Pacote com 4 unidades', 'Fardo com 6 unidades'];

/** Reduz a imagem no navegador (máx. 1200px) antes de enviar. Retorna uma data URL. */
function redimensionarImagem(arquivo, tamanhoMax = 1200) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(arquivo.type)) {
      return reject(new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).'));
    }
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, tamanhoMax / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // fundo branco para PNG transparente
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let dados = canvas.toDataURL('image/webp', 0.85);
      if (!dados.startsWith('data:image/webp')) dados = canvas.toDataURL('image/jpeg', 0.88);
      resolve(dados);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}

function abrirFormulario(produto, depois) {
  const editando = !!produto;
  const p = produto || { nome: '', descricao: '', conteudo: '', codigo_barras: '', preco_centavos: 0, estoque: 0, categoria_id: '', subcategoria_id: '', imagem: '', ativo: 1 };
  let imagem = p.imagem || '';
  let modoImagem = imagem && !imagem.startsWith('/uploads/') ? 'url' : 'arquivo';

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
            <input class="input" name="conteudo" maxlength="80" list="sugestoes-conteudo" placeholder="Ex.: 500ml, 1kg, Caixa com 10" value="${esc(p.conteudo)}">
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
            <label class="rotulo" for="subcategoria">Subcategoria</label>
            <div class="selecao-com-botao">
              <select class="select" id="subcategoria" name="subcategoria_id"></select>
              <button class="btn btn-icone" type="button" data-nova="subcategoria" aria-label="Nova subcategoria" title="Nova subcategoria">${icone('mais')}</button>
            </div>
            <div class="nova-opcao" id="nova-subcategoria" hidden>
              <input class="input" placeholder="Nome da nova subcategoria" maxlength="60">
              <button class="btn btn-primario" type="button">Criar</button>
            </div>
          </div>
          <label class="interruptor largo">
            <input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Visível no catálogo
          </label>
        </div>
      </form>`,
    rodape: `
      ${editando ? `<button class="btn btn-perigo esquerda" type="button" id="excluir">${icone('lixo')} Excluir</button>` : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primario" type="submit" form="form-produto" id="salvar">${editando ? 'Salvar alterações' : 'Cadastrar produto'}</button>`,
  });

  const form = m.querySelector('#form-produto');
  const $m = (sel) => m.querySelector(sel);

  // ---- Imagem
  function desenharImagem() {
    const previa = $m('#previa');
    previa.classList.toggle('tem-imagem', !!imagem);
    previa.innerHTML = imagem
      ? `<img src="${esc(imagem)}" alt="Prévia da imagem">`
      : `<div class="dica">${icone('mais')}<span>${modoImagem === 'url' ? 'Cole a URL abaixo' : 'Clique ou arraste uma imagem'}</span></div>`;
    m.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.modo === modoImagem));
    $m('#url-imagem').hidden = modoImagem !== 'url';
    if (modoImagem === 'url' && !imagem.startsWith('data:') && !imagem.startsWith('/uploads/')) $m('#url-imagem').value = imagem;
    $m('#remover-imagem').hidden = !imagem;
  }
  async function usarArquivo(arquivo) {
    if (!arquivo) return;
    try {
      imagem = await redimensionarImagem(arquivo);
      modoImagem = 'arquivo';
      desenharImagem();
    } catch (erro) { avisar(erro.message, 'erro'); }
  }
  $m('#previa').addEventListener('click', () => { if (modoImagem === 'arquivo') $m('#arquivo-imagem').click(); });
  $m('#previa').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && modoImagem === 'arquivo') { e.preventDefault(); $m('#arquivo-imagem').click(); } });
  $m('#arquivo-imagem').addEventListener('change', (e) => usarArquivo(e.target.files[0]));
  $m('#previa').addEventListener('dragover', (e) => { e.preventDefault(); $m('#previa').classList.add('arrastando'); });
  $m('#previa').addEventListener('dragleave', () => $m('#previa').classList.remove('arrastando'));
  $m('#previa').addEventListener('drop', (e) => { e.preventDefault(); $m('#previa').classList.remove('arrastando'); usarArquivo(e.dataTransfer.files[0]); });
  m.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modoImagem = b.dataset.modo; desenharImagem(); }));
  $m('#url-imagem').addEventListener('input', debounce((e) => { imagem = e.target.value.trim(); desenharImagem(); }, 400));
  $m('#remover-imagem').addEventListener('click', () => { imagem = ''; $m('#url-imagem').value = ''; $m('#arquivo-imagem').value = ''; desenharImagem(); });
  desenharImagem();

  // ---- Código de barras: confere o dígito verificador (só alerta, não bloqueia códigos internos)
  function conferirGtin() {
    const codigo = form.codigo_barras.value.replace(/\D/g, '');
    form.codigo_barras.value = codigo;
    const dica = $m('#dica-gtin');
    dica.className = 'dica-campo';
    if (!codigo) { dica.textContent = ''; return; }
    if (codigo.length < 8) { dica.textContent = 'Use de 8 a 14 dígitos.'; return; }
    const valido = gtinValido(codigo);
    dica.textContent = valido ? 'Dígito verificador válido.' : 'Dígito verificador não confere (verifique ou use como código interno).';
    dica.classList.add(valido ? 'ok' : 'alerta');
  }
  form.codigo_barras.addEventListener('input', conferirGtin);
  conferirGtin();

  // ---- Categorias e subcategorias (com cadastro rápido)
  function preencherCategorias(selecionada) {
    const sel = $m('#categoria');
    sel.innerHTML = `<option value="">Selecione…</option>${categorias.map((c) =>
      `<option value="${c.id}" ${c.id === Number(selecionada) ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}`;
  }
  function preencherSubcategorias(selecionada) {
    const cat = categorias.find((c) => c.id === Number($m('#categoria').value));
    const sel = $m('#subcategoria');
    sel.disabled = !cat;
    m.querySelector('[data-nova="subcategoria"]').disabled = !cat;
    sel.innerHTML = `<option value="">${cat ? 'Nenhuma' : 'Escolha a categoria primeiro'}</option>${(cat?.subcategorias || []).map((s) =>
      `<option value="${s.id}" ${s.id === Number(selecionada) ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}`;
  }
  preencherCategorias(p.categoria_id);
  preencherSubcategorias(p.subcategoria_id);
  $m('#categoria').addEventListener('change', () => preencherSubcategorias(null));

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
        const nova = await api('/api/admin/categorias', { metodo: 'POST', corpo: { nome } });
        categorias.push(nova);
        preencherCategorias(nova.id);
        preencherSubcategorias(null);
      } else {
        const catId = Number($m('#categoria').value);
        const nova = await api(`/api/admin/categorias/${catId}/subcategorias`, { metodo: 'POST', corpo: { nome } });
        categorias.find((c) => c.id === catId).subcategorias.push(nova);
        preencherSubcategorias(nova.id);
      }
      input.value = '';
      caixa.hidden = true;
      avisar(`${tipo === 'categoria' ? 'Categoria' : 'Subcategoria'} “${nome}” criada.`);
    } catch (erro) { avisar(erro.message, 'erro'); }
  }
  ['categoria', 'subcategoria'].forEach((tipo) => {
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
    const problemas = [
      [form.nome, form.nome.value.trim().length < 2, 'Informe o nome do produto.'],
      [form.preco, Number.isNaN(preco), 'Informe um preço válido (ex.: 12,90).'],
      [form.estoque, !Number.isInteger(estoque) || estoque < 0, 'A quantidade deve ser um número inteiro (0 ou mais).'],
      [form.categoria_id, !form.categoria_id.value, 'Escolha uma categoria.'],
    ];
    problemas.forEach(([campo, invalido]) => campo.setAttribute('aria-invalid', invalido));
    const primeiro = problemas.find(([, invalido]) => invalido);
    if (primeiro) { avisar(primeiro[2], 'erro'); primeiro[0].focus(); return; }

    const botao = $m('#salvar');
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    try {
      await api(editando ? `/api/admin/produtos/${produto.id}` : '/api/admin/produtos', {
        metodo: editando ? 'PUT' : 'POST',
        corpo: {
          nome: form.nome.value, descricao: form.descricao.value, conteudo: form.conteudo.value,
          codigo_barras: form.codigo_barras.value, preco_centavos: preco, estoque,
          categoria_id: Number(form.categoria_id.value), subcategoria_id: Number(form.subcategoria_id.value) || null,
          imagem, ativo: form.ativo.checked,
        },
      });
      avisar(editando ? 'Produto atualizado.' : 'Produto cadastrado.');
      fecharModal();
      depois();
    } catch (erro) {
      avisar(erro.message, 'erro');
      botao.disabled = false;
      botao.textContent = editando ? 'Salvar alterações' : 'Cadastrar produto';
    }
  });
  form.nome.focus();
}
