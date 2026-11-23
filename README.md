# WebProductsV — Catálogo de Produtos

Catálogo on-line de uma página: o cliente navega pelos produtos, filtra por **categoria** e
**tema**, busca e pede pelo WhatsApp. O dono da loja gerencia tudo por um painel com login.

- **Front-end:** HTML, CSS e JavaScript puros (sem frameworks, sem build, sem npm).
- **Banco, login e imagens:** [Supabase](https://supabase.com) (Postgres + Auth + Storage), acessado só com `fetch`.
- **Hospedagem:** [Vercel](https://vercel.com) (site estático, publica a cada `git push`).

Arquitetura, banco e permissões: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

| Endereço | O que é |
|---|---|
| `/` | Catálogo (clientes) |
| `/admin/` | Painel: produtos, categorias e temas, aparência da loja, minha conta |

---

## Colocando no ar (uma vez só)

### 1. Criar o projeto no Supabase
1. Em [supabase.com](https://supabase.com) → **New project**. Região sugerida: **South America (São Paulo)**.
2. Use um projeto **só para o catálogo** (não misture com outros sistemas).

### 2. Criar as tabelas
No painel do Supabase → **SQL Editor** → **New query**:
1. Cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
2. Em outra query, cole [`supabase/dados-iniciais.sql`](supabase/dados-iniciais.sql) e **Run**
   (traz as categorias Blister, Box Colecionável e ETB, o tema Pokémon e o produto da versão anterior).

> Os dois arquivos podem ser rodados de novo sem estragar nada. Quando o `schema.sql` mudar em
> alguma atualização, basta rodá-lo outra vez.

### 3. Criar o administrador
1. **Authentication → Sign In / Providers → Email**: desligue **Allow new users to sign up**
   (ninguém precisa se cadastrar; só você entra no painel).
2. **Authentication → Users → Add user → Create new user**: seu e-mail e uma senha forte,
   com **Auto Confirm User** marcado.
3. No **SQL Editor**, dê permissão de admin a essa conta (troque o e-mail):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'seu@email.com'
   on conflict do nothing;
   ```

Ter conta no Supabase **não basta** para mexer no catálogo: só quem está na tabela `admins` grava.

### 4. Ligar o site ao Supabase
**Project Settings → API Keys** (ou o botão **Connect**): copie a **Project URL** e a
**Publishable key** (`sb_publishable_...`) para [`public/js/config.js`](public/js/config.js):

```js
export const CONFIG = {
  supabaseUrl: 'https://abcdefghijkl.supabase.co',
  supabaseKey: 'sb_publishable_...',
};
```

Essas duas informações são públicas (vão para o navegador). **Nunca** use a *Secret key*.
Faça commit e push dessa alteração.

### 5. Publicar na Vercel
1. Em [vercel.com](https://vercel.com) → **Add New… → Project** → importe o repositório `WebProductsV` do GitHub.
2. **Framework Preset: Other**. Não precisa de comando de build: o `vercel.json` já indica a pasta `public`.
3. **Deploy**. A cada `git push` na `main`, o site é atualizado sozinho.
4. (Opcional) **Settings → Domains** para usar um domínio próprio.

### 6. Primeiros passos no painel
Abra `https://seu-site.vercel.app/admin/`, entre e:
1. **Aparência da loja:** nome, slogan, logo, cor da marca, Instagram, WhatsApp, Facebook e TikTok.
2. **Produtos:** envie de novo a foto da *Coleção Treinador Avançado* (o arquivo antigo está em
   `uploads/` nesta pasta, fora do Git) e cadastre os demais produtos.
3. **Categorias e temas:** ajuste nomes, ordem e a cor de cada tema.

---

## Atualizações do banco

Quando uma versão nova precisa mudar o banco, o SQL fica em `supabase/atualizacoes/`. Rode cada
arquivo **uma vez** no SQL Editor do Supabase (rodar de novo não estraga nada). Rodar o
`supabase/schema.sql` inteiro de novo também aplica todas as atualizações.

| Arquivo | O que faz |
|---|---|
| `2026-11-16-idioma-dos-produtos.sql` | Campo **Idioma** do produto (produtos antigos ficam como Português BR) |
| `2026-11-23-pre-venda.sql` | Opção **Pré-venda** no produto (selo no catálogo e botão "Reservar pelo WhatsApp") |

---

## Rodando no computador

```bash
python -m http.server 5630 --directory public
```

Ou dois cliques em `iniciar-servidor.bat`. Abra http://localhost:5630 — o site usa o Supabase
configurado em `js/config.js`.

### Testar com um Supabase local (opcional, precisa do Docker)

```bash
npx supabase start -x realtime,studio,logflare,vector,edge-runtime,mailpit,postgres-meta,imgproxy,supavisor
```

Depois aplique `supabase/schema.sql` e `supabase/dados-iniciais.sql` no banco local, crie um usuário
(e a linha em `admins`) e abra http://localhost:5630/?local=1. O `?local=1` fica salvo no navegador;
`?local=0` volta para o projeto de produção. Para desligar: `npx supabase stop`.

## Personalização

- **Pelo painel:** nome, slogan, logo, cor da marca e redes sociais. Os textos sobre a cor da
  marca ficam brancos ou escuros automaticamente, e cores muito claras são escurecidas onde viram texto.
- **Pelo código:** as demais cores (fundo, bordas, textos) estão em variáveis no topo de
  [`public/css/base.css`](public/css/base.css). O catálogo usa sempre o tema claro; o painel segue o tema do sistema.
