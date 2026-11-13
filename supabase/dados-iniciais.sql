-- =============================================================================
-- WebProductsV — dados migrados da versão anterior (SQLite)
-- Rode DEPOIS do schema.sql. Pode rodar de novo: não duplica nada.
--
-- Na versão antiga havia 1 categoria ("Pokémon") com as subcategorias Blister,
-- Box Colecionável e ETB. Agora o tipo do produto é a CATEGORIA e "Pokémon" é o TEMA.
-- =============================================================================

insert into public.categorias (nome, ordem) values
  ('Blister', 1),
  ('Box Colecionável', 2),
  ('ETB', 3)
on conflict (nome) do nothing;

insert into public.temas (nome, cor, ordem) values
  ('Pokémon', '#e3350d', 1)
on conflict (nome) do nothing;

-- A foto deste produto estava em uploads/ (pasta local). Envie de novo pelo painel.
insert into public.produtos (nome, descricao, conteudo, codigo_barras, preco_centavos, estoque, categoria_id, tema_id)
select
  'Coleção Treinador Avançado de Celebração de 30 Anos do Pokémon Estampas Ilustradas',
  'Coleções Treinador Avançado são ótimas maneiras de conseguir várias cartas e acessórios úteis do Pokémon Estampas Ilustradas. Cada Coleção Treinador Avançado de Celebração de 30 Anos conta com nove pacotes de booster da expansão, uma carta promocional com arte expandida de Nidorina, 65 capas para cartas, dados para usar como contadores de dano, um dado para jogada de moeda, uma moeda de plástico e uma caixa resistente para guardar tudo.',
  'Unidade',
  '7897186020808',
  39900,
  20,
  (select id from public.categorias where nome = 'ETB'),
  (select id from public.temas where nome = 'Pokémon')
where not exists (select 1 from public.produtos where codigo_barras = '7897186020808');
