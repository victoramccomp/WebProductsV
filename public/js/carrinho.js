// Carrinho (resumo do pedido): estado salvo no navegador + gaveta lateral de fechamento.
import {
  api, avisar, esc, formatarReais, icone, imagemProduto, mascararTelefone, telefoneWhatsApp, armazenamento,
} from './util.js';

const CHAVE_ITENS = 'wpv_carrinho';
const CHAVE_CLIENTE = 'wpv_cliente';

// ---------------------------------------------------------------- Estado
const itens = new Map(armazenamento.ler(CHAVE_ITENS, []).map((i) => [i.id, i]));
const ouvintes = new Set();

function salvarENotificar() {
  armazenamento.gravar(CHAVE_ITENS, [...itens.values()]);
  ouvintes.forEach((fn) => fn());
}

export const carrinho = {
  aoMudar(fn) { ouvintes.add(fn); },
  quantidade: (id) => itens.get(id)?.quantidade || 0,
  totalItens: () => [...itens.values()].reduce((s, i) => s + i.quantidade, 0),
  totalCentavos: () => [...itens.values()].reduce((s, i) => s + i.quantidade * i.preco_centavos, 0),
  lista: () => [...itens.values()],

  /** Define a quantidade (0 remove). Respeita o estoque. Retorna a quantidade final. */
  definir(produto, quantidade) {
    const atual = itens.get(produto.id);
    const estoque = produto.estoque ?? atual?.estoque ?? 0;
    const qtd = Math.max(0, Math.min(Math.floor(quantidade) || 0, estoque));
    if (quantidade > estoque) avisar(estoque ? `Só temos ${estoque} unidade(s) de ${produto.nome}.` : `${produto.nome} esgotou.`);
    if (qtd === 0) {
      itens.delete(produto.id);
    } else {
      itens.set(produto.id, {
        id: produto.id, nome: produto.nome, conteudo: produto.conteudo, imagem: produto.imagem,
        preco_centavos: produto.preco_centavos, estoque, quantidade: qtd,
      });
    }
    salvarENotificar();
    return qtd;
  },
  adicionar(produto, qtd = 1) { return this.definir(produto, this.quantidade(produto.id) + qtd); },
  remover(id) { itens.delete(id); salvarENotificar(); },
  limpar() { itens.clear(); salvarENotificar(); },

  /** Atualiza preço/estoque dos itens com os dados mais recentes do servidor. */
  sincronizar(produtos) {
    let mudou = false;
    for (const p of produtos) {
      const item = itens.get(p.id);
      if (!item) continue;
      if (item.preco_centavos !== p.preco_centavos || item.estoque !== p.estoque || item.imagem !== p.imagem) {
        Object.assign(item, { preco_centavos: p.preco_centavos, estoque: p.estoque, imagem: p.imagem, nome: p.nome });
        if (item.quantidade > p.estoque) item.quantidade = p.estoque;
        if (item.quantidade === 0) itens.delete(p.id);
        mudou = true;
      }
    }
    if (mudou) salvarENotificar();
  },
};

// ---------------------------------------------------------------- Gaveta
let loja = {};
let modo = 'itens'; // 'itens' | 'sucesso'
let ultimoFoco = null;
const $ = (id) => document.getElementById(id);

export function iniciarCarrinho(dadosLoja) {
  loja = dadosLoja;
  $('fechar-carrinho').innerHTML = icone('fechar');
  $('abrir-carrinho').querySelector('.botao-carrinho-icone').innerHTML = icone('carrinho');
  $('abrir-carrinho').addEventListener('click', abrirCarrinho);
  $('fechar-carrinho').addEventListener('click', fecharCarrinho);
  $('veu-carrinho').addEventListener('click', fecharCarrinho);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('carrinho').classList.contains('aberta')) fecharCarrinho();
  });

  carrinho.aoMudar(() => {
    atualizarContador(true);
    if (modo === 'itens') renderizarItens();
  });
  atualizarContador(false);
  renderizarEstrutura();
}

export function abrirCarrinho() {
  ultimoFoco = document.activeElement;
  if (modo === 'sucesso' && carrinho.totalItens() > 0) { modo = 'itens'; renderizarEstrutura(); }
  $('carrinho').inert = false;
  $('carrinho').classList.add('aberta');
  $('veu-carrinho').classList.add('aberto');
  document.body.style.overflow = 'hidden';
  $('fechar-carrinho').focus();
}

function fecharCarrinho() {
  $('carrinho').classList.remove('aberta');
  $('veu-carrinho').classList.remove('aberto');
  $('carrinho').inert = true;
  document.body.style.overflow = '';
  if (modo === 'sucesso') { modo = 'itens'; renderizarEstrutura(); }
  ultimoFoco?.focus?.();
}

function atualizarContador(animar) {
  const contador = $('contador-carrinho');
  const total = carrinho.totalItens();
  contador.textContent = total;
  contador.setAttribute('aria-label', `${total} ${total === 1 ? 'item' : 'itens'} no pedido`);
  if (animar) {
    contador.classList.remove('pulsa');
    void contador.offsetWidth; // reinicia a animação
    contador.classList.add('pulsa');
  }
}

/** Monta lista + formulário. O formulário é criado uma vez para não perder o que foi digitado. */
function renderizarEstrutura() {
  const cliente = armazenamento.ler(CHAVE_CLIENTE, {});
  $('titulo-carrinho').textContent = 'Meu pedido';
  $('carrinho-corpo').innerHTML = `
    <div id="lista-itens"></div>
    <form class="form-cliente" id="form-pedido" novalidate>
      <h3>Seus dados</h3>
      <label class="campo">
        <span class="obrigatorio">Nome</span>
        <input class="input" name="nome" autocomplete="name" required maxlength="120" value="${esc(cliente.nome)}">
      </label>
      <div class="linha">
        <label class="campo">
          <span class="obrigatorio">Telefone / WhatsApp</span>
          <input class="input" name="telefone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="(11) 98888-7777" value="${esc(cliente.telefone)}">
        </label>
        <label class="campo">
          <span>E-mail</span>
          <input class="input" name="email" type="email" autocomplete="email" maxlength="160" value="${esc(cliente.email)}">
        </label>
      </div>
      <label class="campo">
        <span>Observações</span>
        <textarea class="textarea" name="observacoes" maxlength="1000" rows="3" placeholder="Ex.: entregar após as 18h, troco para R$ 100…"></textarea>
      </label>
    </form>`;

  const form = $('form-pedido');
  form.telefone.addEventListener('input', (e) => { e.target.value = mascararTelefone(e.target.value); });
  form.addEventListener('submit', enviarPedido);
  renderizarItens();
}

function renderizarItens() {
  const lista = carrinho.lista();
  const form = $('form-pedido');
  const rodape = $('carrinho-rodape');
  if (!lista.length) {
    $('lista-itens').innerHTML = `
      <div class="vazio">
        <strong>Seu pedido está vazio</strong>
        Navegue pelo catálogo e toque em “Adicionar ao pedido”.
      </div>`;
    form.hidden = true;
    rodape.innerHTML = `<button class="btn btn-bloco" type="button" id="continuar">Ver produtos</button>`;
    $('continuar').addEventListener('click', fecharCarrinho);
    return;
  }

  form.hidden = false;
  $('lista-itens').innerHTML = lista.map((i) => `
    <div class="item-carrinho" data-id="${i.id}">
      <div class="miniatura">${imagemProduto(i)}</div>
      <div>
        <div class="nome">${esc(i.nome)}</div>
        <div class="detalhe">${i.conteudo ? `${esc(i.conteudo)} · ` : ''}${formatarReais(i.preco_centavos)} un.</div>
        <div class="controles">
          <div class="quantidade">
            <button type="button" data-acao="menos" aria-label="Diminuir quantidade de ${esc(i.nome)}">${icone('menos')}</button>
            <input type="number" min="1" max="${i.estoque}" value="${i.quantidade}" aria-label="Quantidade de ${esc(i.nome)}">
            <button type="button" data-acao="mais" aria-label="Aumentar quantidade de ${esc(i.nome)}" ${i.quantidade >= i.estoque ? 'disabled' : ''}>${icone('mais')}</button>
          </div>
          <button type="button" class="btn btn-fantasma btn-icone btn-perigo" data-acao="remover" aria-label="Remover ${esc(i.nome)}">${icone('lixo')}</button>
        </div>
        ${i.quantidade >= i.estoque ? `<div class="aviso-estoque">Máximo disponível: ${i.estoque}</div>` : ''}
      </div>
      <div class="subtotal">${formatarReais(i.quantidade * i.preco_centavos)}</div>
    </div>`).join('');

  $('lista-itens').querySelectorAll('.item-carrinho').forEach((linha) => {
    const item = carrinho.lista().find((i) => i.id === Number(linha.dataset.id));
    linha.addEventListener('click', (e) => {
      const acao = e.target.closest('[data-acao]')?.dataset.acao;
      if (acao === 'mais') carrinho.adicionar(item, 1);
      if (acao === 'menos') carrinho.adicionar(item, -1);
      if (acao === 'remover') carrinho.remover(item.id);
    });
    linha.querySelector('input').addEventListener('change', (e) => carrinho.definir(item, Number(e.target.value) || 1));
  });

  const total = carrinho.totalItens();
  rodape.innerHTML = `
    <div class="totais">
      <span>${total} ${total === 1 ? 'item' : 'itens'}</span>
      <strong>${formatarReais(carrinho.totalCentavos())}</strong>
    </div>
    <button class="btn btn-primario btn-bloco" type="submit" form="form-pedido" id="botao-enviar">Enviar pedido</button>
    <p class="nota">Sem pagamento online. A loja confirma o pedido com você.</p>`;
}

async function enviarPedido(e) {
  e.preventDefault();
  const form = e.target;
  const dados = Object.fromEntries(new FormData(form));
  // Validação no navegador (o servidor valida de novo).
  const erros = [];
  form.nome.setAttribute('aria-invalid', dados.nome.trim().length < 2);
  if (dados.nome.trim().length < 2) erros.push('Informe seu nome.');
  const digitos = dados.telefone.replace(/\D/g, '');
  form.telefone.setAttribute('aria-invalid', digitos.length < 10);
  if (digitos.length < 10) erros.push('Informe o telefone com DDD.');
  const emailInvalido = dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email);
  form.email.setAttribute('aria-invalid', !!emailInvalido);
  if (emailInvalido) erros.push('E-mail inválido.');
  if (erros.length) {
    avisar(erros[0], 'erro');
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  armazenamento.gravar(CHAVE_CLIENTE, { nome: dados.nome, telefone: dados.telefone, email: dados.email });
  const botao = $('botao-enviar');
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  try {
    const resposta = await api('/api/pedidos', {
      metodo: 'POST',
      corpo: {
        cliente: dados,
        itens: carrinho.lista().map((i) => ({ produto_id: i.id, quantidade: i.quantidade })),
      },
    });
    carrinho.limpar();
    mostrarSucesso(resposta);
  } catch (erro) {
    // Estoque mudou enquanto o cliente montava o pedido: ajusta o carrinho e avisa.
    if (erro.status === 409 && Array.isArray(erro.detalhes)) {
      for (const d of erro.detalhes) {
        const item = carrinho.lista().find((i) => i.id === d.produto_id);
        if (item) carrinho.definir({ ...item, estoque: d.disponivel }, Math.min(item.quantidade, d.disponivel));
      }
    }
    avisar(erro.message, 'erro');
    const b = $('botao-enviar');
    if (b) { b.disabled = false; b.textContent = 'Enviar pedido'; }
  }
}

function mostrarSucesso(pedido) {
  modo = 'sucesso';
  const lojaAtual = pedido.loja || loja;
  const wa = telefoneWhatsApp(lojaAtual.whatsapp);
  const linkWhats = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(pedido.mensagem)}` : '';
  const linkEmail = lojaAtual.email
    ? `mailto:${encodeURIComponent(lojaAtual.email)}?subject=${encodeURIComponent(`Pedido ${pedido.codigo}`)}&body=${encodeURIComponent(pedido.mensagem.replace(/\*/g, ''))}`
    : '';

  $('titulo-carrinho').textContent = 'Pedido registrado';
  $('carrinho-corpo').innerHTML = `
    <div class="sucesso">
      <div class="sucesso-icone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg></div>
      <h3>Pedido enviado!</h3>
      <div>Número do pedido</div>
      <div class="codigo">${esc(pedido.codigo)}</div>
      <p>${esc(lojaAtual.mensagem || 'Entraremos em contato para confirmar.')}</p>
      <div class="acoes">
        ${linkWhats ? `<a class="btn btn-whatsapp btn-bloco" href="${esc(linkWhats)}" target="_blank" rel="noopener">${icone('whatsapp')} Enviar também pelo WhatsApp</a>` : ''}
        ${linkEmail ? `<a class="btn btn-bloco" href="${esc(linkEmail)}">${icone('email')} Enviar por e-mail</a>` : ''}
        <button class="btn btn-bloco" type="button" id="copiar-resumo">Copiar resumo</button>
      </div>
      <div class="resumo-texto">${esc(pedido.mensagem.replace(/\*/g, ''))}</div>
    </div>`;
  $('carrinho-rodape').innerHTML = `<button class="btn btn-primario btn-bloco" type="button" id="continuar">Continuar comprando</button>`;
  $('continuar').addEventListener('click', fecharCarrinho);
  $('copiar-resumo').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pedido.mensagem.replace(/\*/g, ''));
      avisar('Resumo copiado!');
    } catch {
      avisar('Não foi possível copiar. Selecione o texto abaixo.', 'erro');
    }
  });
}
