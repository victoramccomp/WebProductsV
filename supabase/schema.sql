-- =============================================================================
-- WebProductsV — esquema do banco no Supabase
-- Rode este arquivo inteiro no SQL Editor do Supabase. Ele pode ser rodado de
-- novo sem perder dados (serve também para aplicar atualizações).
-- =============================================================================

-- ---------------------------------------------------------------- Tabelas

create table if not exists public.categorias (
  id         bigint generated always as identity primary key,
  nome       text not null unique check (char_length(btrim(nome)) between 2 and 60),
  ordem      integer not null default 0,
  criado_em  timestamptz not null default now()
);

create table if not exists public.temas (
  id         bigint generated always as identity primary key,
  nome       text not null unique check (char_length(btrim(nome)) between 2 and 60),
  cor        text not null default '#64748b' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ordem      integer not null default 0,
  criado_em  timestamptz not null default now()
);

create table if not exists public.produtos (
  id              bigint generated always as identity primary key,
  nome            text not null check (char_length(btrim(nome)) between 2 and 160),
  descricao       text not null default '' check (char_length(descricao) <= 4000),
  conteudo        text not null default '' check (char_length(conteudo) <= 160),
  codigo_barras   text unique check (codigo_barras ~ '^[0-9]{8,14}$'),
  preco_centavos  integer not null check (preco_centavos >= 0),
  estoque         integer not null default 0 check (estoque >= 0),
  categoria_id    bigint not null references public.categorias (id) on delete restrict,
  tema_id         bigint references public.temas (id) on delete set null,
  imagem          text not null default '' check (char_length(imagem) <= 1000),
  idioma          text not null default 'pt-BR',
  pre_venda       boolean not null default false,
  sob_encomenda   boolean not null default false,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists produtos_categoria_idx on public.produtos (categoria_id);
create index if not exists produtos_tema_idx on public.produtos (tema_id);

-- Idioma do produto (atualização de 2026-11): bancos antigos ganham a coluna aqui.
-- A lista precisa bater com public/js/idiomas.js.
alter table public.produtos add column if not exists idioma text not null default 'pt-BR';
alter table public.produtos drop constraint if exists produtos_idioma_check;
alter table public.produtos add constraint produtos_idioma_check
  check (idioma in ('ja', 'en', 'de', 'fr', 'it', 'pt-BR', 'es-ES', 'es-419', 'ko', 'zh-Hant', 'zh-Hans', 'th', 'id'));

-- Pré-venda (atualização de 2026-11-23): o produto aparece como "Pré-venda" e aceita reservas.
alter table public.produtos add column if not exists pre_venda boolean not null default false;

-- Sob encomenda + conteúdo até 160 caracteres (atualização de 2026-11-25).
alter table public.produtos add column if not exists sob_encomenda boolean not null default false;
alter table public.produtos drop constraint if exists produtos_conteudo_check;
alter table public.produtos add constraint produtos_conteudo_check check (char_length(conteudo) <= 160);

-- Uma única linha com a identidade visual e os contatos da loja.
create table if not exists public.loja (
  id             integer primary key default 1 check (id = 1),
  nome           text not null default 'Minha Loja' check (char_length(btrim(nome)) between 1 and 80),
  slogan         text not null default '' check (char_length(slogan) <= 140),
  logo_url       text not null default '' check (char_length(logo_url) <= 1000),
  cor_primaria   text not null default '#4f46e5' check (cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  instagram      text not null default '' check (char_length(instagram) <= 200),
  whatsapp       text not null default '' check (whatsapp ~ '^[0-9]{0,15}$'),
  facebook       text not null default '' check (char_length(facebook) <= 200),
  tiktok         text not null default '' check (char_length(tiktok) <= 200),
  atualizado_em  timestamptz not null default now()
);
insert into public.loja (id) values (1) on conflict (id) do nothing;

-- Quem pode mexer no painel. Ter conta no Supabase Auth NÃO basta: o usuário
-- precisa estar nesta tabela (veja o README, passo "Criar o administrador").
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------- Funções

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists produtos_atualizado_em on public.produtos;
create trigger produtos_atualizado_em before update on public.produtos
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists loja_atualizado_em on public.loja;
create trigger loja_atualizado_em before update on public.loja
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------- Permissões (RLS)
-- Visitantes só leem. Só quem está em public.admins grava.

alter table public.categorias enable row level security;
alter table public.temas      enable row level security;
alter table public.produtos   enable row level security;
alter table public.loja       enable row level security;
alter table public.admins     enable row level security;

drop policy if exists "categorias: leitura pública" on public.categorias;
create policy "categorias: leitura pública" on public.categorias for select to anon, authenticated using (true);
drop policy if exists "categorias: admin grava" on public.categorias;
create policy "categorias: admin grava" on public.categorias for all to authenticated
  using ((select public.eh_admin())) with check ((select public.eh_admin()));

drop policy if exists "temas: leitura pública" on public.temas;
create policy "temas: leitura pública" on public.temas for select to anon, authenticated using (true);
drop policy if exists "temas: admin grava" on public.temas;
create policy "temas: admin grava" on public.temas for all to authenticated
  using ((select public.eh_admin())) with check ((select public.eh_admin()));

-- Produto oculto (ativo = false) só aparece para o admin.
drop policy if exists "produtos: leitura pública dos ativos" on public.produtos;
create policy "produtos: leitura pública dos ativos" on public.produtos for select to anon, authenticated
  using (ativo or (select public.eh_admin()));
drop policy if exists "produtos: admin grava" on public.produtos;
create policy "produtos: admin grava" on public.produtos for all to authenticated
  using ((select public.eh_admin())) with check ((select public.eh_admin()));

drop policy if exists "loja: leitura pública" on public.loja;
create policy "loja: leitura pública" on public.loja for select to anon, authenticated using (true);
drop policy if exists "loja: admin altera" on public.loja;
create policy "loja: admin altera" on public.loja for update to authenticated
  using ((select public.eh_admin())) with check ((select public.eh_admin()));

-- Cada usuário logado só consegue ver se ele mesmo é admin.
drop policy if exists "admins: vê a própria linha" on public.admins;
create policy "admins: vê a própria linha" on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

-- Permissões de tabela (o RLS acima decide linha a linha).
grant usage on schema public to anon, authenticated;
grant select on public.categorias, public.temas, public.produtos, public.loja to anon, authenticated;
grant insert, update, delete on public.categorias, public.temas, public.produtos to authenticated;
grant update on public.loja to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.eh_admin() to anon, authenticated;

-- ---------------------------------------------------------------- Imagens (Storage)
-- Bucket público "imagens": qualquer um vê, só o admin envia/troca/apaga.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagens', 'imagens', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "imagens: admin lê" on storage.objects;
create policy "imagens: admin lê" on storage.objects for select to authenticated
  using (bucket_id = 'imagens' and (select public.eh_admin()));
drop policy if exists "imagens: admin envia" on storage.objects;
create policy "imagens: admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'imagens' and (select public.eh_admin()));
drop policy if exists "imagens: admin substitui" on storage.objects;
create policy "imagens: admin substitui" on storage.objects for update to authenticated
  using (bucket_id = 'imagens' and (select public.eh_admin()));
drop policy if exists "imagens: admin apaga" on storage.objects;
create policy "imagens: admin apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'imagens' and (select public.eh_admin()));
