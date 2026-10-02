// Popula o banco com categorias e produtos fictícios para testar o catálogo.
// Uso: node scripts/dados-exemplo.js   (só roda se ainda não houver produtos)
const { db, transacao, slugify } = require('../src/db');

if (db.prepare('SELECT COUNT(*) AS n FROM produtos').get().n > 0) {
  console.log('Já existem produtos cadastrados. Nada foi alterado.');
  process.exit(0);
}

// Gera um EAN-13 válido (prefixo 789 = Brasil) com dígito verificador calculado.
let sequencia = 1000;
function ean13() {
  const base = `789${String(Date.now()).slice(-5)}${String(sequencia++).padStart(4, '0')}`.slice(0, 12);
  const soma = [...base].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return base + ((10 - (soma % 10)) % 10);
}

const CATALOGO = {
  Bebidas: {
    Refrigerantes: [
      ['Refrigerante de Cola', 'Refrigerante sabor cola, gelado fica ainda melhor.', '2 L', 1099, 48],
      ['Refrigerante de Guaraná', 'Feito com extrato natural de guaraná.', 'Lata 350ml', 499, 120],
    ],
    Sucos: [
      ['Suco Integral de Uva', 'Suco 100% uva, sem adição de açúcar.', '1 L', 1490, 30],
      ['Néctar de Pêssego', 'Néctar de pêssego pronto para beber.', '1 L', 789, 0],
    ],
    Águas: [
      ['Água Mineral sem Gás', 'Água mineral natural.', 'Fardo com 6 x 1,5 L', 1590, 25],
      ['Água com Gás', 'Água mineral gaseificada.', '500ml', 299, 3],
    ],
  },
  Mercearia: {
    'Grãos e Cereais': [
      ['Arroz Branco Tipo 1', 'Arroz agulhinha, grãos soltinhos.', '5 kg', 2890, 40],
      ['Feijão Carioca', 'Feijão carioca tipo 1, cozimento rápido.', '1 kg', 899, 60],
    ],
    Massas: [
      ['Macarrão Espaguete', 'Massa de sêmola com ovos.', '500 g', 549, 80],
      ['Macarrão Parafuso Integral', 'Massa integral rica em fibras.', '500 g', 729, 15],
    ],
    Matinais: [
      ['Café Torrado e Moído', 'Café tradicional, torra média.', '500 g', 2290, 22],
      ['Granola com Frutas', 'Mix de aveia, castanhas e frutas desidratadas.', '800 g', 2490, 2],
    ],
  },
  Limpeza: {
    Roupas: [
      ['Sabão Líquido para Roupas', 'Limpeza profunda e perfume duradouro.', '3 L', 3990, 18],
      ['Amaciante Concentrado', 'Rende até 3x mais.', '1,5 L', 1890, 26],
    ],
    Cozinha: [
      ['Detergente Neutro', 'Remove gordura com facilidade.', '500ml', 289, 150],
      ['Esponja Dupla Face', 'Esponja multiuso não risca.', 'Pacote com 4 unidades', 699, 70],
    ],
  },
  Higiene: {
    Cabelos: [
      ['Shampoo Hidratante', 'Para todos os tipos de cabelo.', '400ml', 1690, 34],
    ],
    'Higiene Bucal': [
      ['Creme Dental Menta', 'Proteção anticáries com flúor.', '90 g', 449, 90],
      ['Escova Dental Macia', 'Cerdas macias, cabo anatômico.', 'Caixa com 2 unidades', 1290, 12],
    ],
  },
};

transacao(() => {
  const inserirCategoria = db.prepare('INSERT INTO categorias (nome, slug, ordem) VALUES (?, ?, ?)');
  const inserirSub = db.prepare('INSERT INTO subcategorias (categoria_id, nome, slug, ordem) VALUES (?, ?, ?, ?)');
  const inserirProduto = db.prepare(`
    INSERT INTO produtos (nome, descricao, conteudo, codigo_barras, preco_centavos, estoque, categoria_id, subcategoria_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let ordemCat = 0;
  let total = 0;
  for (const [categoria, subs] of Object.entries(CATALOGO)) {
    const catId = db.prepare('SELECT id FROM categorias WHERE nome = ?').get(categoria)?.id
      ?? inserirCategoria.run(categoria, slugify(categoria), ++ordemCat).lastInsertRowid;
    let ordemSub = 0;
    for (const [sub, produtos] of Object.entries(subs)) {
      const subId = db.prepare('SELECT id FROM subcategorias WHERE categoria_id = ? AND nome = ?').get(catId, sub)?.id
        ?? inserirSub.run(catId, sub, slugify(sub), ++ordemSub).lastInsertRowid;
      for (const [nome, descricao, conteudo, preco, estoque] of produtos) {
        inserirProduto.run(nome, descricao, conteudo, ean13(), preco, estoque, catId, subId);
        total++;
      }
    }
  }
  console.log(`Pronto! ${total} produtos de exemplo cadastrados.`);
});
