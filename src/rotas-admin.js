// API do painel administrativo. Tudo em /api/admin/* exige login.
const { db, transacao, slugify, lerConfiguracoes } = require('./db');
const { ErroHttp, lerJson, enviarJson, ipDoCliente } = require('./http');
const auth = require('./auth');
const { normalizarImagem, apagarImagemLocal } = require('./imagens');

const STATUS_PEDIDO = ['pendente', 'em_analise', 'aprovado', 'cancelado'];
const texto = (valor, max) => String(valor ?? '').trim().slice(0, max);

function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 8) {
    throw new ErroHttp(400, 'A senha precisa ter pelo menos 8 caracteres.');
  }
}

function inteiro(valor, nome, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErroHttp(400, `${nome} inválido.`);
  return n;
}

// ---------- Autenticação ----------
function registrarRotasAuth(router) {
  // Diz ao painel se já existe admin (senão mostra a tela de primeiro acesso) e quem está logado.
  router.get('/api/auth/estado', (req, res) => {
    const temUsuario = !!db.prepare('SELECT 1 FROM usuarios LIMIT 1').get();
    enviarJson(res, 200, { configurado: temUsuario, usuario: auth.usuarioDaSessao(req) });
  });

  // Primeiro acesso: cria o administrador. Só funciona enquanto não houver nenhum usuário.
  router.post('/api/auth/primeiro-acesso', async (req, res) => {
    const { nome, email, senha } = await lerJson(req);
    if (db.prepare('SELECT 1 FROM usuarios LIMIT 1').get()) {
      throw new ErroHttp(403, 'O administrador já foi criado. Faça login.');
    }
    if (texto(nome, 80).length < 2) throw new ErroHttp(400, 'Informe seu nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw new ErroHttp(400, 'E-mail inválido.');
    validarSenha(senha);
    const { lastInsertRowid } = db.prepare('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)')
      .run(texto(nome, 80), texto(email, 160), auth.gerarHashSenha(senha));
    auth.criarSessao(res, Number(lastInsertRowid), req.seguro);
    enviarJson(res, 201, { ok: true });
  });

  router.post('/api/auth/login', async (req, res) => {
    const ip = ipDoCliente(req);
    auth.verificarLimiteLogin(ip);
    const { email, senha } = await lerJson(req);
    const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(texto(email, 160));
    if (!usuario || !auth.conferirSenha(String(senha || ''), usuario.senha_hash)) {
      auth.registrarFalhaLogin(ip);
      throw new ErroHttp(401, 'E-mail ou senha incorretos.');
    }
    auth.limparFalhasLogin(ip);
    auth.criarSessao(res, usuario.id, req.seguro);
    enviarJson(res, 200, { ok: true, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  });

  router.post('/api/auth/logout', (req, res) => {
    auth.encerrarSessao(req, res);
    enviarJson(res, 200, { ok: true });
  });
}

// ---------- Produtos ----------
const SELECT_PRODUTO_ADMIN = `
  SELECT p.*, c.nome AS categoria, s.nome AS subcategoria
  FROM produtos p
  JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN subcategorias s ON s.id = p.subcategoria_id
`;

function validarProduto(corpo) {
  const nome = texto(corpo.nome, 160);
  if (nome.length < 2) throw new ErroHttp(400, 'Informe o nome do produto.');

  const codigo = texto(corpo.codigo_barras, 20).replace(/\s/g, '');
  if (codigo && !/^\d{8,14}$/.test(codigo)) {
    throw new ErroHttp(400, 'O código de barras deve ter de 8 a 14 dígitos (EAN/GTIN).');
  }

  const categoriaId = inteiro(corpo.categoria_id, 'Categoria', { min: 1 });
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId)) {
    throw new ErroHttp(400, 'Escolha uma categoria válida.');
  }
  let subcategoriaId = null;
  if (corpo.subcategoria_id) {
    subcategoriaId = inteiro(corpo.subcategoria_id, 'Subcategoria', { min: 1 });
    const sub = db.prepare('SELECT categoria_id FROM subcategorias WHERE id = ?').get(subcategoriaId);
    if (!sub || sub.categoria_id !== categoriaId) {
      throw new ErroHttp(400, 'A subcategoria não pertence à categoria escolhida.');
    }
  }

  return {
    nome,
    descricao: texto(corpo.descricao, 4000),
    conteudo: texto(corpo.conteudo, 80),
    codigo_barras: codigo || null,
    preco_centavos: inteiro(corpo.preco_centavos, 'Preço', { max: 100_000_000 }),
    estoque: inteiro(corpo.estoque, 'Estoque', { max: 10_000_000 }),
    categoria_id: categoriaId,
    subcategoria_id: subcategoriaId,
    ativo: corpo.ativo === false ? 0 : 1,
  };
}

function traduzirErroBanco(erro) {
  if (/UNIQUE constraint failed: produtos\.codigo_barras/.test(erro.message)) {
    return new ErroHttp(409, 'Já existe um produto com esse código de barras.');
  }
  if (/UNIQUE constraint failed: (sub)?categorias/.test(erro.message)) {
    return new ErroHttp(409, 'Já existe um item com esse nome.');
  }
  return erro;
}

function registrarRotasProdutos(router, exigirLogin) {
  router.get('/api/admin/produtos', exigirLogin, (req, res) => {
    enviarJson(res, 200, db.prepare(`${SELECT_PRODUTO_ADMIN} ORDER BY p.nome COLLATE NOCASE`).all());
  });

  router.get('/api/admin/produtos/:id', exigirLogin, (req, res) => {
    const produto = db.prepare(`${SELECT_PRODUTO_ADMIN} WHERE p.id = ?`).get(Number(req.params.id));
    if (!produto) throw new ErroHttp(404, 'Produto não encontrado.');
    enviarJson(res, 200, produto);
  });

  router.post('/api/admin/produtos', exigirLogin, async (req, res) => {
    const corpo = await lerJson(req);
    const dados = validarProduto(corpo);
    dados.imagem = normalizarImagem(corpo.imagem);
    try {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO produtos (nome, descricao, conteudo, codigo_barras, preco_centavos, estoque,
                              categoria_id, subcategoria_id, imagem, ativo)
        VALUES (:nome, :descricao, :conteudo, :codigo_barras, :preco_centavos, :estoque,
                :categoria_id, :subcategoria_id, :imagem, :ativo)
      `).run(dados);
      enviarJson(res, 201, db.prepare(`${SELECT_PRODUTO_ADMIN} WHERE p.id = ?`).get(lastInsertRowid));
    } catch (erro) {
      apagarImagemLocal(dados.imagem);
      throw traduzirErroBanco(erro);
    }
  });

  router.put('/api/admin/produtos/:id', exigirLogin, async (req, res) => {
    const id = Number(req.params.id);
    const atual = db.prepare('SELECT imagem FROM produtos WHERE id = ?').get(id);
    if (!atual) throw new ErroHttp(404, 'Produto não encontrado.');
    const corpo = await lerJson(req);
    const dados = validarProduto(corpo);
    dados.imagem = normalizarImagem(corpo.imagem);
    dados.id = id;
    try {
      db.prepare(`
        UPDATE produtos SET nome = :nome, descricao = :descricao, conteudo = :conteudo,
          codigo_barras = :codigo_barras, preco_centavos = :preco_centavos, estoque = :estoque,
          categoria_id = :categoria_id, subcategoria_id = :subcategoria_id, imagem = :imagem,
          ativo = :ativo, atualizado_em = datetime('now')
        WHERE id = :id
      `).run(dados);
    } catch (erro) {
      if (dados.imagem !== atual.imagem) apagarImagemLocal(dados.imagem);
      throw traduzirErroBanco(erro);
    }
    if (atual.imagem !== dados.imagem) apagarImagemLocal(atual.imagem);
    enviarJson(res, 200, db.prepare(`${SELECT_PRODUTO_ADMIN} WHERE p.id = ?`).get(id));
  });

  router.delete('/api/admin/produtos/:id', exigirLogin, (req, res) => {
    const produto = db.prepare('SELECT imagem FROM produtos WHERE id = ?').get(Number(req.params.id));
    if (!produto) throw new ErroHttp(404, 'Produto não encontrado.');
    // Itens de pedidos antigos continuam com nome e preço salvos (produto_id vira NULL).
    db.prepare('DELETE FROM produtos WHERE id = ?').run(Number(req.params.id));
    apagarImagemLocal(produto.imagem);
    enviarJson(res, 200, { ok: true });
  });
}

// ---------- Categorias e subcategorias ----------
function registrarRotasCategorias(router, exigirLogin) {
  router.get('/api/admin/categorias', exigirLogin, (req, res) => {
    const categorias = db.prepare(`
      SELECT c.id, c.nome, c.slug, c.ordem,
             (SELECT COUNT(*) FROM produtos p WHERE p.categoria_id = c.id) AS total
      FROM categorias c ORDER BY c.ordem, c.nome
    `).all();
    const subs = db.prepare(`
      SELECT s.id, s.categoria_id, s.nome, s.slug,
             (SELECT COUNT(*) FROM produtos p WHERE p.subcategoria_id = s.id) AS total
      FROM subcategorias s ORDER BY s.ordem, s.nome
    `).all();
    enviarJson(res, 200, categorias.map((c) => ({ ...c, subcategorias: subs.filter((s) => s.categoria_id === c.id) })));
  });

  router.post('/api/admin/categorias', exigirLogin, async (req, res) => {
    const nome = texto((await lerJson(req)).nome, 60);
    if (nome.length < 2) throw new ErroHttp(400, 'Informe o nome da categoria.');
    try {
      const ordem = db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM categorias').get().o;
      const { lastInsertRowid } = db.prepare('INSERT INTO categorias (nome, slug, ordem) VALUES (?, ?, ?)')
        .run(nome, slugify(nome), ordem);
      enviarJson(res, 201, { id: Number(lastInsertRowid), nome, slug: slugify(nome), subcategorias: [], total: 0 });
    } catch (erro) { throw traduzirErroBanco(erro); }
  });

  router.put('/api/admin/categorias/:id', exigirLogin, async (req, res) => {
    const nome = texto((await lerJson(req)).nome, 60);
    if (nome.length < 2) throw new ErroHttp(400, 'Informe o nome da categoria.');
    try {
      const r = db.prepare('UPDATE categorias SET nome = ?, slug = ? WHERE id = ?').run(nome, slugify(nome), Number(req.params.id));
      if (!r.changes) throw new ErroHttp(404, 'Categoria não encontrada.');
    } catch (erro) { throw traduzirErroBanco(erro); }
    enviarJson(res, 200, { ok: true });
  });

  router.delete('/api/admin/categorias/:id', exigirLogin, (req, res) => {
    const id = Number(req.params.id);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM produtos WHERE categoria_id = ?').get(id);
    if (n) throw new ErroHttp(409, `Esta categoria tem ${n} produto(s). Mova ou exclua os produtos antes.`);
    db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
    enviarJson(res, 200, { ok: true });
  });

  router.post('/api/admin/categorias/:id/subcategorias', exigirLogin, async (req, res) => {
    const categoriaId = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId)) throw new ErroHttp(404, 'Categoria não encontrada.');
    const nome = texto((await lerJson(req)).nome, 60);
    if (nome.length < 2) throw new ErroHttp(400, 'Informe o nome da subcategoria.');
    try {
      const ordem = db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM subcategorias WHERE categoria_id = ?').get(categoriaId).o;
      const { lastInsertRowid } = db.prepare('INSERT INTO subcategorias (categoria_id, nome, slug, ordem) VALUES (?, ?, ?, ?)')
        .run(categoriaId, nome, slugify(nome), ordem);
      enviarJson(res, 201, { id: Number(lastInsertRowid), categoria_id: categoriaId, nome, slug: slugify(nome), total: 0 });
    } catch (erro) { throw traduzirErroBanco(erro); }
  });

  router.put('/api/admin/subcategorias/:id', exigirLogin, async (req, res) => {
    const nome = texto((await lerJson(req)).nome, 60);
    if (nome.length < 2) throw new ErroHttp(400, 'Informe o nome da subcategoria.');
    try {
      const r = db.prepare('UPDATE subcategorias SET nome = ?, slug = ? WHERE id = ?').run(nome, slugify(nome), Number(req.params.id));
      if (!r.changes) throw new ErroHttp(404, 'Subcategoria não encontrada.');
    } catch (erro) { throw traduzirErroBanco(erro); }
    enviarJson(res, 200, { ok: true });
  });

  // Produtos da subcategoria excluída continuam na categoria, só ficam sem subcategoria.
  router.delete('/api/admin/subcategorias/:id', exigirLogin, (req, res) => {
    db.prepare('DELETE FROM subcategorias WHERE id = ?').run(Number(req.params.id));
    enviarJson(res, 200, { ok: true });
  });
}

// ---------- Pedidos ----------
function registrarRotasPedidos(router, exigirLogin) {
  router.get('/api/admin/pedidos', exigirLogin, (req, res) => {
    const status = req.query.get('status');
    const sql = `
      SELECT p.*, (SELECT SUM(quantidade) FROM itens_pedido i WHERE i.pedido_id = p.id) AS total_itens
      FROM pedidos p ${STATUS_PEDIDO.includes(status) ? 'WHERE p.status = ?' : ''}
      ORDER BY p.id DESC LIMIT 500`;
    const pedidos = STATUS_PEDIDO.includes(status) ? db.prepare(sql).all(status) : db.prepare(sql).all();
    const contagem = Object.fromEntries(STATUS_PEDIDO.map((s) => [s, 0]));
    for (const l of db.prepare('SELECT status, COUNT(*) AS n FROM pedidos GROUP BY status').all()) contagem[l.status] = l.n;
    enviarJson(res, 200, { pedidos, contagem });
  });

  router.get('/api/admin/pedidos/:id', exigirLogin, (req, res) => {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(Number(req.params.id));
    if (!pedido) throw new ErroHttp(404, 'Pedido não encontrado.');
    pedido.itens = db.prepare(`
      SELECT i.*, pr.estoque AS estoque_atual, pr.imagem FROM itens_pedido i
      LEFT JOIN produtos pr ON pr.id = i.produto_id WHERE i.pedido_id = ? ORDER BY i.id
    `).all(pedido.id);
    enviarJson(res, 200, pedido);
  });

  // Mudar status. Aprovar baixa o estoque; sair de "aprovado" devolve o estoque.
  router.patch('/api/admin/pedidos/:id', exigirLogin, async (req, res) => {
    const id = Number(req.params.id);
    const { status } = await lerJson(req);
    if (!STATUS_PEDIDO.includes(status)) throw new ErroHttp(400, 'Status inválido.');

    transacao(() => {
      const pedido = db.prepare('SELECT status FROM pedidos WHERE id = ?').get(id);
      if (!pedido) throw new ErroHttp(404, 'Pedido não encontrado.');
      if (pedido.status === status) return;
      const itens = db.prepare('SELECT produto_id, nome_produto, quantidade FROM itens_pedido WHERE pedido_id = ? AND produto_id IS NOT NULL').all(id);

      if (status === 'aprovado') {
        const faltando = [];
        for (const i of itens) {
          const r = db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ? AND estoque >= ?').run(i.quantidade, i.produto_id, i.quantidade);
          if (!r.changes) faltando.push(i.nome_produto);
        }
        if (faltando.length) throw new ErroHttp(409, `Estoque insuficiente para aprovar: ${faltando.join(', ')}.`);
      } else if (pedido.status === 'aprovado') {
        for (const i of itens) db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(i.quantidade, i.produto_id);
      }
      db.prepare("UPDATE pedidos SET status = ?, atualizado_em = datetime('now') WHERE id = ?").run(status, id);
    });
    enviarJson(res, 200, { ok: true });
  });
}

// ---------- Resumo, configurações e senha ----------
function registrarRotasGerais(router, exigirLogin) {
  router.get('/api/admin/resumo', exigirLogin, (req, res) => {
    enviarJson(res, 200, db.prepare(`
      SELECT (SELECT COUNT(*) FROM produtos) AS produtos,
             (SELECT COUNT(*) FROM produtos WHERE estoque = 0) AS sem_estoque,
             (SELECT COUNT(*) FROM categorias) AS categorias,
             (SELECT COUNT(*) FROM pedidos WHERE status = 'pendente') AS pedidos_pendentes
    `).get());
  });

  router.get('/api/admin/configuracoes', exigirLogin, (req, res) => enviarJson(res, 200, lerConfiguracoes()));

  router.put('/api/admin/configuracoes', exigirLogin, async (req, res) => {
    const corpo = await lerJson(req);
    const permitidas = { loja_nome: 80, loja_whatsapp: 20, loja_email: 160, loja_mensagem: 500 };
    const atualizar = db.prepare('UPDATE configuracoes SET valor = ? WHERE chave = ?');
    transacao(() => {
      for (const [chave, max] of Object.entries(permitidas)) {
        if (chave in corpo) atualizar.run(texto(corpo[chave], max), chave);
      }
    });
    enviarJson(res, 200, lerConfiguracoes());
  });

  router.put('/api/admin/senha', exigirLogin, async (req, res) => {
    const { atual, nova } = await lerJson(req);
    const usuario = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(req.usuario.id);
    if (!auth.conferirSenha(String(atual || ''), usuario.senha_hash)) throw new ErroHttp(400, 'A senha atual está incorreta.');
    validarSenha(nova);
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(auth.gerarHashSenha(nova), req.usuario.id);
    // Derruba as outras sessões e mantém esta.
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(req.usuario.id);
    auth.criarSessao(res, req.usuario.id, req.seguro);
    enviarJson(res, 200, { ok: true });
  });
}

function registrarRotasAdmin(router) {
  const exigirLogin = (req) => auth.exigirLogin(req);
  registrarRotasAuth(router);
  registrarRotasProdutos(router, exigirLogin);
  registrarRotasCategorias(router, exigirLogin);
  registrarRotasPedidos(router, exigirLogin);
  registrarRotasGerais(router, exigirLogin);
}

module.exports = { registrarRotasAdmin };
