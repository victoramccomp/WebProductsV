-- =============================================================================
-- Atualização: sob encomenda + conteúdo maior
-- Produto "sob encomenda" ganha a etiqueta no catálogo (mesmo sem estoque) e o
-- botão "Encomendar pelo WhatsApp". O campo Conteúdo passa de 80 para 160 caracteres.
-- Pode rodar mais de uma vez sem problema.
-- =============================================================================

alter table public.produtos add column if not exists sob_encomenda boolean not null default false;

alter table public.produtos drop constraint if exists produtos_conteudo_check;
alter table public.produtos add constraint produtos_conteudo_check check (char_length(conteudo) <= 160);

notify pgrst, 'reload schema';
