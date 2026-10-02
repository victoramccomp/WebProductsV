// Banco de dados SQLite usando o módulo nativo do Node (node:sqlite, Node 22.13+).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PASTA_DADOS = path.join(__dirname, '..', 'data');
fs.mkdirSync(PASTA_DADOS, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(PASTA_DADOS, 'loja.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Função SQL para buscas sem diferenciar acentos e maiúsculas: sem_acento('Água') = 'agua'
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
db.function('sem_acento', { deterministic: true }, semAcento);

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY,
  nome        TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash  TEXT    NOT NULL,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash  TEXT    PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categorias (
  id     INTEGER PRIMARY KEY,
  nome   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  slug   TEXT    NOT NULL UNIQUE,
  ordem  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subcategorias (
  id            INTEGER PRIMARY KEY,
  categoria_id  INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  nome          TEXT    NOT NULL COLLATE NOCASE,
  slug          TEXT    NOT NULL,
  ordem         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (categoria_id, nome),
  UNIQUE (categoria_id, slug)
);

CREATE TABLE IF NOT EXISTS produtos (
  id               INTEGER PRIMARY KEY,
  nome             TEXT    NOT NULL,
  descricao        TEXT    NOT NULL DEFAULT '',
  conteudo         TEXT    NOT NULL DEFAULT '',
  codigo_barras    TEXT    UNIQUE,
  preco_centavos   INTEGER NOT NULL CHECK (preco_centavos >= 0),
  estoque          INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),
  categoria_id     INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  subcategoria_id  INTEGER REFERENCES subcategorias(id) ON DELETE SET NULL,
  imagem           TEXT    NOT NULL DEFAULT '',
  ativo            INTEGER NOT NULL DEFAULT 1,
  criado_em        TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria_id, subcategoria_id);

CREATE TABLE IF NOT EXISTS pedidos (
  id                INTEGER PRIMARY KEY,
  codigo            TEXT    NOT NULL UNIQUE,
  cliente_nome      TEXT    NOT NULL,
  cliente_telefone  TEXT    NOT NULL,
  cliente_email     TEXT    NOT NULL DEFAULT '',
  observacoes       TEXT    NOT NULL DEFAULT '',
  total_centavos    INTEGER NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'em_analise', 'aprovado', 'cancelado')),
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status, criado_em);

-- Os itens guardam uma "foto" do produto no momento do pedido (nome, preço...),
-- para que editar ou excluir o produto depois não altere pedidos antigos.
CREATE TABLE IF NOT EXISTS itens_pedido (
  id                    INTEGER PRIMARY KEY,
  pedido_id             INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id            INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
  nome_produto          TEXT    NOT NULL,
  conteudo              TEXT    NOT NULL DEFAULT '',
  codigo_barras         TEXT,
  preco_unit_centavos   INTEGER NOT NULL,
  quantidade            INTEGER NOT NULL CHECK (quantidade > 0),
  subtotal_centavos     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracoes (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES
  ('loja_nome', 'Minha Loja'),
  ('loja_whatsapp', ''),
  ('loja_email', ''),
  ('loja_mensagem', 'Seu pedido será analisado e entraremos em contato para confirmar.');
`);

/** Executa fn dentro de uma transação (desfaz tudo se der erro). */
function transacao(fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

function slugify(texto) {
  return semAcento(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function lerConfiguracoes() {
  const linhas = db.prepare('SELECT chave, valor FROM configuracoes').all();
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}

module.exports = { db, transacao, slugify, semAcento, lerConfiguracoes };
