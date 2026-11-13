# Arquitetura do WebProductsV

## Visão geral

```
Navegador (HTML/CSS/JS puros, ES modules)
   │  fetch
   ├── /rest/v1/…     Supabase PostgREST  → tabelas (RLS decide quem lê/grava)
   ├── /auth/v1/…     Supabase Auth       → login do admin (e-mail + senha)
   └── /storage/v1/…  Supabase Storage    → bucket público "imagens" (produtos e logo)

Vercel: só serve os arquivos de public/ (sem servidor próprio).
```

- **Sem servidor próprio:** toda regra de permissão fica no banco (Row Level Security).
- **Sem biblioteca:** `public/js/supabase.js` faz Auth, REST e Storage com `fetch`
  (mesmo padrão do SmallPDVMobile).
- **Versão anterior** (Node + SQLite + carrinho de pedidos) está no histórico do Git, no commit `42db0e0`.

## Banco de dados

```
categorias 1──N produtos N──1 temas (opcional)
loja (1 linha: identidade visual e contatos)
admins (user_id → auth.users)
```

| Tabela | Colunas principais | Observações |
|---|---|---|
| `categorias` | `id`, `nome` (único), `ordem` | Tipo do produto (Blister, Box, ETB…). `ordem` = ordem na barra lateral. |
| `temas` | `id`, `nome` (único), `cor` (`#rrggbb`), `ordem` | Assunto do produto (Pokémon, Digimon…). A cor aparece no catálogo. |
| `produtos` | `id`, `nome`, `descricao`, `conteudo`, `codigo_barras` (único, 8–14 dígitos), `preco_centavos`, `estoque`, `categoria_id` (obrigatório), `tema_id` (opcional), `imagem` (URL), `ativo`, `criado_em`, `atualizado_em` | Preço em **centavos** (inteiro). `ativo = false` esconde do catálogo. |
| `loja` | `nome`, `slogan`, `logo_url`, `cor_primaria`, `instagram`, `whatsapp` (só dígitos, com DDI), `facebook`, `tiktok` | Uma única linha (`id = 1`). |
| `admins` | `user_id` | Quem pode gravar. Conta no Auth sem linha aqui não grava nada. |

Excluir categoria com produtos é bloqueado (`on delete restrict`). Excluir tema deixa os produtos sem tema.
O SQL completo e idempotente está em [`supabase/schema.sql`](../supabase/schema.sql).

## Permissões (RLS)

| Quem | Pode |
|---|---|
| Visitante (anon) | Ler categorias, temas, loja e produtos **ativos** |
| Usuário logado que **não** está em `admins` | O mesmo que o visitante |
| Admin (`public.eh_admin()`) | Ler tudo (inclusive ocultos), criar/alterar/excluir categorias, temas e produtos, alterar a loja, enviar/apagar imagens |

Testado localmente: visitante e conta comum não conseguem inserir, alterar, apagar, se tornar admin
nem enviar arquivos; o admin consegue.

## Estrutura de pastas

```
WebProductsV/
├── public/                    ← o que a Vercel publica
│   ├── index.html             Catálogo (layout "vitrine com barra lateral")
│   ├── admin/index.html       Painel
│   ├── css/  base.css · catalogo.css · admin.css · pdf.css
│   ├── js/
│   │   ├── config.js          URL + chave pública do Supabase
│   │   ├── supabase.js        Auth, REST e Storage via fetch
│   │   ├── loja.js            Cor da marca (contraste automático), logo, redes sociais
│   │   ├── util.js            Formatação, ícones, avisos, busca sem acento
│   │   ├── catalogo.js        Filtros (categoria + vários temas), busca, ordenação, detalhes, WhatsApp
│   │   ├── admin.js           Login, rotas do painel, Minha conta
│   │   ├── admin-produtos.js  Tabela + formulário CRUD (upload/URL de imagem)
│   │   ├── admin-organizacao.js  Categorias e temas (ordem, cor, renomear, excluir)
│   │   ├── admin-aparencia.js Nome, slogan, logo, cor, redes — com prévia ao vivo
│   │   ├── admin-pdf.js       Catálogo em PDF: folhas A4 com capa, índice e paginação
│   │   └── admin-ui.js        Modal, confirmação, R$ ↔ centavos, GTIN, redimensionar imagem
│   └── img/icone.svg
├── supabase/
│   ├── schema.sql             Tabelas, RLS, bucket e políticas (rode no SQL Editor)
│   ├── dados-iniciais.sql     Dados migrados da versão anterior
│   └── config.toml            Só para o Supabase local (npx supabase start)
├── docs/
│   ├── ARQUITETURA.md
│   └── layouts/               Mockups A, B e C (o escolhido foi o A)
├── vercel.json                Pasta publicada, URLs limpas, cabeçalhos de segurança
└── iniciar-servidor.bat       Servidor local de dois cliques
```

## Comportamento do catálogo

- Tudo carrega de uma vez (4 consultas) e os filtros rodam no navegador: busca instantânea, sem acentos.
- **Categoria:** escolha única. **Temas:** vários ao mesmo tempo (somam). As contagens da lateral
  consideram os outros filtros ativos.
- Filtros ficam na URL (`?categoria=etb&temas=pokemon,digimon&q=…`) e cada produto tem link
  próprio (`?produto=ID`), bons para compartilhar no Instagram/WhatsApp.
- Com WhatsApp configurado, cada produto tem **Pedir pelo WhatsApp** (ou **Avise-me quando chegar**
  se estiver esgotado), com o nome, o preço e o link do produto na mensagem.
- Imagens são reduzidas no navegador (máx. 1200 px, WebP) antes de ir para o Storage; ao trocar ou
  excluir, a imagem antiga é apagada do bucket.

## Catálogo em PDF (painel)

- Tela **Catálogo em PDF** monta folhas A4 em HTML com a identidade da loja: capa na cor da marca
  (logo, nome, slogan, índice com páginas, contatos e temas), faixa com as cores dos temas, cabeçalho
  e rodapé com redes sociais e número da página em todas as folhas.
- Três modelos: **Vitrine** (3 por linha), **Detalhado** (2 por linha, com descrição) e **Lista de preços**.
  Agrupa por categoria ou tema (a seção usa a cor do tema), ordena e filtra por categoria/tema.
- A paginação é feita no navegador: cada produto é colocado na folha e, se não couber, vai para a
  próxima (com "continuação" no título da seção). A prévia é a própria folha reduzida.
- **Baixar PDF** espera as imagens carregarem e chama `window.print()`; o CSS de impressão
  (`@page A4, margem 0`) deixa só as folhas. No diálogo, o usuário escolhe "Salvar como PDF".
  Texto continua selecionável e cada produto é um link para `/?produto=ID` no catálogo online.
- As opções ficam salvas no navegador (`localStorage` `wpv_pdf_opcoes`).
