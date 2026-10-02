// API pública: o que o catálogo usa (sem login).
const crypto = require('node:crypto');
const { db, transacao, semAcento, lerConfiguracoes } = require('./db');
const { ErroHttp, lerJson, enviarJson, ipDoCliente } = require('./http');

const formatarReais = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Colunas que o catálogo pode ver (sem dados internos).
const SELECT_PRODUTO_PUBLICO = `
  SELECT p.id, p.nome, p.descricao, p.conteudo, p.codigo_barras, p.preco_centavos, p.estoque,
         p.imagem, c.nome AS categoria, c.slug AS categoria_slug,
         s.nome AS subcategoria, s.slug AS subcategoria_slug
  FROM produtos p
  JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN subcategorias s ON s.id = p.subcategoria_id
`;

const ORDENACOES = {
  nome: 'p.nome COLLATE NOCASE ASC',
  menor_preco: 'p.preco_centavos ASC, p.nome',
  maior_preco: 'p.preco_centavos DESC, p.nome',
  recentes: 'p.id DESC',
};

function montarMensagemPedido(pedido, itens, loja) {
  const linhas = [
    `*Pedido ${pedido.codigo}* — ${loja.loja_nome}`,
    '',
    ...itens.map((i) => `• ${i.quantidade}x ${i.nome_produto}${i.conteudo ? ` (${i.conteudo})` : ''} — ${formatarReais(i.subtotal_centavos)}`),
    '',
    `*Total: ${formatarReais(pedido.total_centavos)}*`,
    '',
    `Cliente: ${pedido.cliente_nome}`,
    `WhatsApp: ${pedido.cliente_telefone}`,
  ];
  if (pedido.cliente_email) linhas.push(`E-mail: ${pedido.cliente_email}`);
  if (pedido.observacoes) linhas.push(`Observações: ${pedido.observacoes}`);
  return linhas.join('\n');
}

function gerarCodigoPedido() {
  const data = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // AAMMDD
  for (;;) {
    const codigo = `${data}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (!db.prepare('SELECT 1 FROM pedidos WHERE codigo = ?').get(codigo)) return codigo;
  }
}

// Limite anti-spam: 10 pedidos a cada 10 minutos por IP.
const pedidosPorIp = new Map();
function verificarLimitePedidos(ip) {
  const agora = Date.now();
  const lista = (pedidosPorIp.get(ip) || []).filter((t) => agora - t < 10 * 60 * 1000);
  if (lista.length >= 10) throw new ErroHttp(429, 'Muitos pedidos em sequência. Aguarde alguns minutos.');
  lista.push(agora);
  pedidosPorIp.set(ip, lista);
}

function texto(valor, max) {
  return String(valor ?? '').trim().slice(0, max);
}

function registrarRotasPublicas(router) {
  router.get('/api/loja', (req, res) => {
    const c = lerConfiguracoes();
    enviarJson(res, 200, {
      nome: c.loja_nome, whatsapp: c.loja_whatsapp, email: c.loja_email, mensagem: c.loja_mensagem,
    });
  });

  // Categorias com subcategorias e a contagem de produtos ativos de cada uma.
  router.get('/api/categorias', (req, res) => {
    const categorias = db.prepare(`
      SELECT c.id, c.nome, c.slug,
             (SELECT COUNT(*) FROM produtos p WHERE p.categoria_id = c.id AND p.ativo = 1) AS total
      FROM categorias c ORDER BY c.ordem, c.nome
    `).all();
    const subs = db.prepare(`
      SELECT s.id, s.categoria_id, s.nome, s.slug,
             (SELECT COUNT(*) FROM produtos p WHERE p.subcategoria_id = s.id AND p.ativo = 1) AS total
      FROM subcategorias s ORDER BY s.ordem, s.nome
    `).all();
    enviarJson(res, 200, categorias.map((c) => ({
      ...c,
      subcategorias: subs.filter((s) => s.categoria_id === c.id),
    })));
  });

  router.get('/api/produtos', (req, res) => {
    const filtros = ['p.ativo = 1'];
    const valores = [];
    const categoria = req.query.get('categoria');
    const subcategoria = req.query.get('subcategoria');
    const busca = semAcento(texto(req.query.get('q'), 100));

    if (categoria) { filtros.push('c.slug = ?'); valores.push(categoria); }
    if (categoria && subcategoria) { filtros.push('s.slug = ?'); valores.push(subcategoria); }
    if (busca) {
      // Cada palavra precisa aparecer no nome, na descrição ou no código de barras.
      for (const palavra of busca.split(/\s+/).slice(0, 6)) {
        filtros.push(`(sem_acento(p.nome) LIKE ? OR sem_acento(p.descricao) LIKE ?
                      OR sem_acento(p.conteudo) LIKE ? OR p.codigo_barras LIKE ?)`);
        const termo = `%${palavra.replace(/[%_]/g, '')}%`;
        valores.push(termo, termo, termo, termo);
      }
    }
    const ordem = ORDENACOES[req.query.get('ordem')] || 'p.estoque = 0, p.nome COLLATE NOCASE';
    const produtos = db.prepare(
      `${SELECT_PRODUTO_PUBLICO} WHERE ${filtros.join(' AND ')} ORDER BY ${ordem} LIMIT 1000`,
    ).all(...valores);
    enviarJson(res, 200, produtos);
  });

  router.get('/api/produtos/:id', (req, res) => {
    const produto = db.prepare(`${SELECT_PRODUTO_PUBLICO} WHERE p.id = ? AND p.ativo = 1`).get(Number(req.params.id));
    if (!produto) throw new ErroHttp(404, 'Produto não encontrado.');
    enviarJson(res, 200, produto);
  });

  router.post('/api/pedidos', async (req, res) => {
    const corpo = await lerJson(req);
    const cliente = corpo.cliente || {};
    const nome = texto(cliente.nome, 120);
    const telefone = texto(cliente.telefone, 30);
    const email = texto(cliente.email, 160);
    const observacoes = texto(cliente.observacoes, 1000);

    if (nome.length < 2) throw new ErroHttp(400, 'Informe seu nome.');
    const digitos = telefone.replace(/\D/g, '');
    if (digitos.length < 10 || digitos.length > 13) throw new ErroHttp(400, 'Informe um telefone/WhatsApp com DDD.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroHttp(400, 'E-mail inválido.');

    // Junta itens repetidos e valida quantidades.
    const quantidades = new Map();
    for (const item of Array.isArray(corpo.itens) ? corpo.itens.slice(0, 200) : []) {
      const id = Number(item.produto_id);
      const qtd = Number(item.quantidade);
      if (!Number.isInteger(id) || !Number.isInteger(qtd) || qtd < 1 || qtd > 9999) {
        throw new ErroHttp(400, 'Item do pedido inválido.');
      }
      quantidades.set(id, (quantidades.get(id) || 0) + qtd);
    }
    if (!quantidades.size) throw new ErroHttp(400, 'Seu pedido está vazio.');

    verificarLimitePedidos(ipDoCliente(req));

    const resultado = transacao(() => {
      const buscarProduto = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1');
      const itens = [];
      const problemas = [];
      for (const [id, qtd] of quantidades) {
        const p = buscarProduto.get(id);
        if (!p) { problemas.push({ produto_id: id, disponivel: 0, mensagem: 'Um produto não está mais disponível.' }); continue; }
        if (qtd > p.estoque) {
          problemas.push({ produto_id: id, disponivel: p.estoque, mensagem: p.estoque ? `${p.nome}: só ${p.estoque} disponível(is).` : `${p.nome} esgotou.` });
          continue;
        }
        // O preço vem SEMPRE do banco, nunca do navegador.
        itens.push({
          produto_id: p.id, nome_produto: p.nome, conteudo: p.conteudo, codigo_barras: p.codigo_barras,
          preco_unit_centavos: p.preco_centavos, quantidade: qtd, subtotal_centavos: p.preco_centavos * qtd,
        });
      }
      if (problemas.length) {
        const erro = new ErroHttp(409, problemas.map((p) => p.mensagem).join(' '));
        erro.detalhes = problemas;
        throw erro;
      }

      const pedido = {
        codigo: gerarCodigoPedido(), cliente_nome: nome, cliente_telefone: telefone, cliente_email: email,
        observacoes, total_centavos: itens.reduce((soma, i) => soma + i.subtotal_centavos, 0),
      };
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO pedidos (codigo, cliente_nome, cliente_telefone, cliente_email, observacoes, total_centavos)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(pedido.codigo, nome, telefone, email, observacoes, pedido.total_centavos);
      const inserirItem = db.prepare(`
        INSERT INTO itens_pedido (pedido_id, produto_id, nome_produto, conteudo, codigo_barras,
                                  preco_unit_centavos, quantidade, subtotal_centavos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const i of itens) {
        inserirItem.run(lastInsertRowid, i.produto_id, i.nome_produto, i.conteudo, i.codigo_barras,
          i.preco_unit_centavos, i.quantidade, i.subtotal_centavos);
      }
      return { pedido, itens };
    });

    const loja = lerConfiguracoes();
    enviarJson(res, 201, {
      codigo: resultado.pedido.codigo,
      total_centavos: resultado.pedido.total_centavos,
      itens: resultado.itens,
      mensagem: montarMensagemPedido(resultado.pedido, resultado.itens, loja),
      loja: { nome: loja.loja_nome, whatsapp: loja.loja_whatsapp, email: loja.loja_email, mensagem: loja.loja_mensagem },
    });
  });
}

module.exports = { registrarRotasPublicas, formatarReais };
