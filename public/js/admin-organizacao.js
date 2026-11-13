// Painel › Categorias e temas: criar, renomear, reordenar, colorir (temas) e excluir.
import { rest } from './supabase.js';
import { avisar, esc, icone } from './util.js';
import { confirmar, pedirTexto } from './admin-ui.js';
import { CORES_TEMA } from './admin-produtos.js';

const TIPOS = {
  categorias: {
    titulo: 'Categorias', singular: 'categoria', select: 'id,nome,ordem', campo: 'categoria_id',
    descricao: 'O tipo do produto (ex.: Blister, Box, ETB). Cada produto tem uma categoria.',
  },
  temas: {
    titulo: 'Temas', singular: 'tema', select: 'id,nome,cor,ordem', campo: 'tema_id',
    descricao: 'O assunto do produto (ex.: Pokémon, Games). Opcional; o cliente pode filtrar por vários.',
  },
};

export async function vistaOrganizacao(v) {
  const [categorias, temas, produtos] = await Promise.all([
    rest(`categorias?select=${TIPOS.categorias.select}&order=ordem,nome`, { admin: true }),
    rest(`temas?select=${TIPOS.temas.select}&order=ordem,nome`, { admin: true }),
    rest('produtos?select=categoria_id,tema_id', { admin: true }),
  ]);
  const dados = { categorias, temas };
  const contar = (tipo, id) => produtos.filter((p) => p[TIPOS[tipo].campo] === id).length;

  v.innerHTML = `
    <div class="cabecalho"><div><h1>Categorias e temas</h1>
      <p>Organizam a barra lateral do catálogo. A ordem aqui é a ordem que o cliente vê.</p></div></div>
    <div class="organizacao">
      ${Object.entries(TIPOS).map(([tipo, t]) => `
        <section class="secao" data-tipo="${tipo}">
          <h2>${t.titulo}</h2>
          <p>${t.descricao}</p>
          <form class="nova-categoria" data-nova>
            <label class="sr-only" for="novo-${tipo}">Nova ${t.singular}</label>
            <input class="input" id="novo-${tipo}" placeholder="Nome ${t.singular === 'tema' ? 'do novo tema' : 'da nova categoria'}" maxlength="60" required>
            <button class="btn btn-primario" type="submit">${icone('mais')} Adicionar</button>
          </form>
          <ul class="lista-ordenavel">
            ${dados[tipo].map((item, i) => `
              <li data-id="${item.id}">
                ${tipo === 'temas' ? `<label class="cor-tema" title="Cor do tema"><span class="sr-only">Cor de ${esc(item.nome)}</span>
                  <input type="color" value="${esc(item.cor)}" data-acao="cor"></label>` : ''}
                <span class="nome">${esc(item.nome)}</span>
                <small>${contar(tipo, item.id)} produto(s)</small>
                <button class="btn btn-fantasma btn-icone btn-pequeno" data-acao="subir" aria-label="Subir ${esc(item.nome)}" ${i === 0 ? 'disabled' : ''}>▲</button>
                <button class="btn btn-fantasma btn-icone btn-pequeno" data-acao="descer" aria-label="Descer ${esc(item.nome)}" ${i === dados[tipo].length - 1 ? 'disabled' : ''}>▼</button>
                <button class="btn btn-fantasma btn-icone btn-pequeno" data-acao="renomear" aria-label="Renomear ${esc(item.nome)}">${icone('editar')}</button>
                <button class="btn btn-fantasma btn-icone btn-pequeno btn-perigo" data-acao="excluir" aria-label="Excluir ${esc(item.nome)}">${icone('lixo')}</button>
              </li>`).join('') || `<li class="vazio-lista">Nenhum${t.singular === 'tema' ? ' tema' : 'a categoria'} ainda.</li>`}
          </ul>
        </section>`).join('')}
    </div>`;

  const recarregar = () => vistaOrganizacao(v);
  const executar = async (promessa, mensagem) => {
    try { await promessa; if (mensagem) avisar(mensagem); await recarregar(); } catch (erro) { avisar(erro.message, 'erro'); }
  };

  v.querySelectorAll('[data-tipo]').forEach((secao) => {
    const tipo = secao.dataset.tipo;
    const t = TIPOS[tipo];
    const lista = dados[tipo];

    secao.querySelector('[data-nova]').addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = e.target.querySelector('input').value.trim();
      if (nome.length < 2) return avisar('Digite um nome com pelo menos 2 letras.', 'erro');
      const corpo = { nome, ordem: lista.length + 1 };
      if (tipo === 'temas') corpo.cor = CORES_TEMA[lista.length % CORES_TEMA.length];
      executar(rest(tipo, {
        metodo: 'POST', admin: true, corpo, prefer: 'return=minimal',
        mensagens: { 23505: `Já existe ${t.singular === 'tema' ? 'um tema' : 'uma categoria'} com esse nome.` },
      }), `${t.singular === 'tema' ? 'Tema' : 'Categoria'} “${nome}” criad${t.singular === 'tema' ? 'o' : 'a'}.`);
    });

    secao.querySelector('.lista-ordenavel').addEventListener('change', (e) => {
      if (e.target.dataset.acao !== 'cor') return;
      const id = Number(e.target.closest('[data-id]').dataset.id);
      executar(rest(`temas?id=eq.${id}`, { metodo: 'PATCH', admin: true, corpo: { cor: e.target.value }, prefer: 'return=minimal' }), 'Cor atualizada.');
    });

    secao.querySelector('.lista-ordenavel').addEventListener('click', async (e) => {
      const botao = e.target.closest('button[data-acao]');
      if (!botao) return;
      const i = lista.findIndex((x) => x.id === Number(botao.closest('[data-id]').dataset.id));
      const item = lista[i];
      const acao = botao.dataset.acao;

      if (acao === 'subir' || acao === 'descer') {
        const nova = [...lista];
        const j = acao === 'subir' ? i - 1 : i + 1;
        [nova[i], nova[j]] = [nova[j], nova[i]];
        // Renumera 1..n e grava só o que mudou.
        const mudancas = nova.map((x, k) => ({ ...x, novaOrdem: k + 1 })).filter((x) => x.ordem !== x.novaOrdem);
        return executar(Promise.all(mudancas.map((x) => rest(`${tipo}?id=eq.${x.id}`, {
          metodo: 'PATCH', admin: true, corpo: { ordem: x.novaOrdem }, prefer: 'return=minimal',
        }))));
      }
      if (acao === 'renomear') {
        const nome = await pedirTexto({ titulo: `Renomear ${t.singular}`, rotulo: 'Nome', valor: item.nome });
        if (nome && nome !== item.nome) {
          executar(rest(`${tipo}?id=eq.${item.id}`, {
            metodo: 'PATCH', admin: true, corpo: { nome }, prefer: 'return=minimal',
            mensagens: { 23505: 'Já existe outro item com esse nome.' },
          }), 'Nome atualizado.');
        }
      }
      if (acao === 'excluir') {
        const n = contar(tipo, item.id);
        if (tipo === 'categorias' && n) {
          return avisar(`“${item.nome}” tem ${n} produto(s). Mude a categoria desses produtos antes de excluir.`, 'erro');
        }
        const extra = tipo === 'temas' && n ? ` Os ${n} produto(s) dele ficam sem tema.` : '';
        if (await confirmar({ titulo: `Excluir ${t.singular}`, mensagem: `Excluir “${item.nome}”?${extra}`, botao: 'Excluir', perigo: true })) {
          executar(rest(`${tipo}?id=eq.${item.id}`, {
            metodo: 'DELETE', admin: true,
            mensagens: { 23503: `“${item.nome}” ainda tem produtos. Mude a categoria deles antes de excluir.` },
          }), `${t.singular === 'tema' ? 'Tema excluído' : 'Categoria excluída'}.`);
        }
      }
    });
  });
}
