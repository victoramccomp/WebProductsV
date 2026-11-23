-- =============================================================================
-- Atualização: pré-venda
-- Produto marcado como pré-venda aparece com o selo "Pré-venda" no catálogo
-- (mesmo sem estoque) e o botão vira "Reservar pelo WhatsApp".
-- Pode rodar mais de uma vez sem problema.
-- =============================================================================

alter table public.produtos add column if not exists pre_venda boolean not null default false;

notify pgrst, 'reload schema';
