# Arquitetura do WebProductsV

## 1. Stacks avaliadas

| | **A. Front puro + PocketBase** | **B. Front puro + Node.js nativo** ✅ escolhida | **C. Next.js + Supabase** |
|---|---|---|---|
| Front-end | HTML/CSS/JS puros | HTML/CSS/JS puros (ES modules) | React + Tailwind, com build |
| Back-end | Binário único em Go (SQLite, autenticação, arquivos, API REST, painel próprio) | `server.js` com `node:http`, `node:sqlite` e `node:crypto` — **zero dependências** | Supabase (Postgres, Auth, Storage, RLS) na nuvem |
| Para rodar | Baixar `pocketbase.exe` | `node server.js` | `npm install` + conta Supabase + chaves |
| Prós | Login, upload e permissões prontos e testados | Nada para instalar; todo o código é legível e didático; backup = copiar uma pasta | Escala, ecossistema, deploy fácil na Vercel |
| Contras | Depende de binário de terceiros; regras configuradas fora do código | Auth/sessões/upload escritos à mão (mais código próprio para manter) | `npm`/build; dependência de serviço externo; pesado para um catálogo simples |
| Hospedagem | VPS ou PocketHost | Qualquer VPS, Render, Railway, Fly.io | Vercel + Supabase |

**Por que B:** mantém o padrão dos projetos VPlays (sem npm, sem build, abre com dois cliques),
roda offline e tem tudo o que o catálogo precisa. Se um dia precisar escalar (muitos acessos
simultâneos, várias lojas), dá para trocar o SQLite por Postgres mantendo a mesma API.

## 2. Esquema do banco (SQLite)

```
usuarios 1───N sessoes

categorias 1───N subcategorias
     │                │
     1                1 (opcional)
     │                │
     N                N
     └──── produtos ──┘
               │ 1
               │
               N (produto_id vira NULL se o produto for excluído)
pedidos 1───N itens_pedido

configuracoes (chave → valor)
```

| Tabela | Colunas principais | Observações |
|---|---|---|
| `usuarios` | `id`, `nome`, `email` (único, sem diferenciar maiúsculas), `senha_hash`, `criado_em` | Senha com **scrypt** + sal aleatório (`scrypt$sal$hash`). |
| `sessoes` | `token_hash` (PK), `usuario_id`, `expira_em` | Guarda só o **SHA-256 do token**; o token vai no cookie `HttpOnly; SameSite=Strict`. Validade de 7 dias. |
| `categorias` | `id`, `nome` (único), `slug` (único), `ordem` | O `slug` vai na URL do catálogo (`?categoria=bebidas`). |
| `subcategorias` | `id`, `categoria_id` → categorias (CASCADE), `nome`, `slug`, `ordem` | Nome e slug únicos **dentro** da categoria. |
| `produtos` | `id`, `nome`, `descricao`, `conteudo`, `codigo_barras` (único, opcional), `preco_centavos`, `estoque`, `categoria_id` (RESTRICT), `subcategoria_id` (SET NULL), `imagem`, `ativo`, `criado_em`, `atualizado_em` | Preço em **centavos (inteiro)** para não ter erro de arredondamento. `imagem` = `/uploads/arquivo.webp` ou URL externa. `ativo = 0` esconde do catálogo. |
| `pedidos` | `id`, `codigo` (único, ex.: `261002-A307B2`), `cliente_nome`, `cliente_telefone`, `cliente_email`, `observacoes`, `total_centavos`, `status`, `criado_em`, `atualizado_em` | `status` ∈ `pendente`, `em_analise`, `aprovado`, `cancelado` (CHECK). |
| `itens_pedido` | `id`, `pedido_id` (CASCADE), `produto_id` (SET NULL), `nome_produto`, `conteudo`, `codigo_barras`, `preco_unit_centavos`, `quantidade`, `subtotal_centavos` | **Cópia dos dados do produto** no momento do pedido: editar ou excluir o produto não altera pedidos antigos. |
| `configuracoes` | `chave`, `valor` | `loja_nome`, `loja_whatsapp`, `loja_email`, `loja_mensagem`. |

O SQL completo está em [`src/db.js`](../src/db.js).

### Regras de negócio

- O **preço do pedido é sempre recalculado no servidor** a partir do banco; o navegador só envia `produto_id` e `quantidade`.
- O pedido é recusado (HTTP 409) se pedir mais do que o estoque; o carrinho se ajusta sozinho.
- **Aprovar** um pedido dá baixa no estoque (em transação; falha se faltar produto).
  Tirar um pedido de "Aprovado" (ex.: cancelar) **devolve** as quantidades.
- Categoria com produtos não pode ser excluída. Excluir subcategoria mantém os produtos na categoria.

## 3. Estrutura de pastas

```
WebProductsV/
├── server.js                 Servidor HTTP: API + arquivos estáticos + uploads
├── iniciar-servidor.bat      Atalho de dois cliques (Windows)
├── src/
│   ├── db.js                 Conexão SQLite, criação das tabelas, helpers (transação, slug)
│   ├── http.js               Roteador mínimo, leitura de JSON, cookies, ErroHttp
│   ├── auth.js               scrypt, sessões, exigirLogin, limite de tentativas
│   ├── imagens.js            Salva upload base64 (confere assinatura JPG/PNG/WebP)
│   ├── rotas-publicas.js     /api/loja, /api/categorias, /api/produtos, POST /api/pedidos
│   └── rotas-admin.js        /api/auth/*, /api/admin/* (produtos, categorias, pedidos, configurações)
├── public/                   Tudo que o navegador recebe
│   ├── index.html            Catálogo
│   ├── admin/index.html      Painel administrativo
│   ├── css/
│   │   ├── base.css          Tokens de cor (tema claro/escuro), botões, formulários, modal, gaveta
│   │   ├── catalogo.css
│   │   └── admin.css
│   ├── js/
│   │   ├── util.js           api(), formatarReais(), esc(), ícones SVG, máscara de telefone
│   │   ├── catalogo.js       Sidebar de categorias, busca, grade, modal do produto
│   │   ├── carrinho.js       Estado do carrinho + gaveta de fechamento do pedido
│   │   ├── admin.js          Login, rotas do painel, Pedidos, Categorias, Configurações
│   │   ├── admin-produtos.js Tabela + formulário CRUD de produtos (upload/URL de imagem)
│   │   └── admin-ui.js       Modal, confirmação, conversão R$ ↔ centavos, validação GTIN
│   └── img/icone.svg
├── scripts/dados-exemplo.js  Popula o banco com 19 produtos fictícios
├── data/                     loja.db (criado automaticamente — fora do Git)
├── uploads/                  Imagens enviadas pelo painel (fora do Git)
└── docs/ARQUITETURA.md       Este arquivo
```

## 4. API

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/loja` | público | Nome, WhatsApp, e-mail e mensagem da loja |
| GET | `/api/categorias` | público | Categorias + subcategorias + contagem de produtos ativos |
| GET | `/api/produtos?categoria=&subcategoria=&q=&ordem=` | público | Produtos ativos. `q` busca em nome, descrição, conteúdo e código, sem diferenciar acentos. `ordem`: `nome`, `menor_preco`, `maior_preco`, `recentes` |
| GET | `/api/produtos/:id` | público | Um produto |
| POST | `/api/pedidos` | público | `{ cliente: {nome, telefone, email, observacoes}, itens: [{produto_id, quantidade}] }` → código + texto pronto para WhatsApp/e-mail |
| GET | `/api/auth/estado` | público | `{ configurado, usuario }` |
| POST | `/api/auth/primeiro-acesso` | só sem usuários | Cria o administrador |
| POST | `/api/auth/login` · `/api/auth/logout` | público | Sessão por cookie |
| GET/POST | `/api/admin/produtos` | admin | Listar / criar |
| GET/PUT/DELETE | `/api/admin/produtos/:id` | admin | Ler / editar / excluir |
| GET/POST | `/api/admin/categorias` | admin | Listar / criar |
| PUT/DELETE | `/api/admin/categorias/:id` | admin | Renomear / excluir |
| POST | `/api/admin/categorias/:id/subcategorias` | admin | Criar subcategoria |
| PUT/DELETE | `/api/admin/subcategorias/:id` | admin | Renomear / excluir |
| GET | `/api/admin/pedidos?status=` | admin | Lista + contagem por status |
| GET/PATCH | `/api/admin/pedidos/:id` | admin | Detalhes / mudar `status` |
| GET | `/api/admin/resumo` | admin | Indicadores do painel |
| GET/PUT | `/api/admin/configuracoes` | admin | Dados da loja |
| PUT | `/api/admin/senha` | admin | Trocar senha |

## 5. Segurança

- Senhas com scrypt; comparação em tempo constante; 5 erros de login = 15 min de bloqueio por IP.
- Cookie de sessão `HttpOnly` + `SameSite=Strict` (+ `Secure` atrás de HTTPS). Mutations exigem
  `Content-Type: application/json`, o que bloqueia CSRF por formulário de outro site.
- Todo texto vindo do banco é escapado antes de ir para o HTML (`esc()`).
- Uploads: limite de 3 MB, tipo conferido pelos bytes do arquivo (não pela extensão), nome aleatório.
- Arquivos estáticos protegidos contra `../` (path traversal).
- Limite de 10 pedidos a cada 10 minutos por IP.
- Em produção, rode atrás de HTTPS (Caddy ou Nginx) — veja o README.
