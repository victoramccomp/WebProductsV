-- =============================================================================
-- Atualização: idioma do produto
-- Rode no SQL Editor do Supabase ANTES (ou logo depois) de publicar a versão
-- com o campo "Idioma". Pode rodar mais de uma vez sem problema.
-- Produtos já cadastrados ficam como Português (Brasil); ajuste no painel.
-- =============================================================================

alter table public.produtos add column if not exists idioma text not null default 'pt-BR';

alter table public.produtos drop constraint if exists produtos_idioma_check;
alter table public.produtos add constraint produtos_idioma_check
  check (idioma in ('ja', 'en', 'de', 'fr', 'it', 'pt-BR', 'es-ES', 'es-419', 'ko', 'zh-Hant', 'zh-Hans', 'th', 'id'));

-- Avisa a API do Supabase sobre a coluna nova.
notify pgrst, 'reload schema';
