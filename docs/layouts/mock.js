// Dados fictícios e ilustrações SVG compartilhados pelos 3 mockups de layout.
window.MOCK = (() => {
  const loja = {
    nome: 'Pixel & Cia',
    slogan: 'Presentes geek feitos com carinho',
    instagram: '@pixelecia',
  };

  const categorias = [
    { nome: 'Camisetas', qtd: 18 },
    { nome: 'Canecas', qtd: 12 },
    { nome: 'Chaveiros', qtd: 9 },
    { nome: 'Adesivos', qtd: 24 },
    { nome: 'Pôsteres', qtd: 7 },
  ];

  const temas = [
    { nome: 'Games', cor: '#7c3aed', qtd: 22 },
    { nome: 'Anime', cor: '#e11d48', qtd: 17 },
    { nome: 'Retrô', cor: '#d97706', qtd: 11 },
    { nome: 'Espaço', cor: '#2563eb', qtd: 12 },
    { nome: 'Natureza', cor: '#16a34a', qtd: 8 },
  ];

  const produtos = [
    ['Camiseta Controle Clássico', 'Camisetas', 'Games', 'Algodão · P ao GG', 79.9, 12],
    ['Caneca Planeta Anelado', 'Canecas', 'Espaço', '325 ml', 49.9, 8],
    ['Chaveiro Cartucho 8 bits', 'Chaveiros', 'Retrô', 'Acrílico 5 cm', 19.9, 30],
    ['Kit Adesivos Folhas', 'Adesivos', 'Natureza', 'Cartela com 12', 14.9, 3],
    ['Pôster Nebulosa', 'Pôsteres', 'Espaço', 'A3 · papel couché', 34.9, 15],
    ['Camiseta Herói Ninja', 'Camisetas', 'Anime', 'Algodão · P ao GG', 84.9, 0],
    ['Caneca Pixel Coração', 'Canecas', 'Retrô', '325 ml', 44.9, 20],
    ['Chaveiro Astronauta', 'Chaveiros', 'Espaço', 'Emborrachado 6 cm', 22.9, 2],
    ['Kit Adesivos Arcade', 'Adesivos', 'Games', 'Cartela com 10', 12.9, 40],
    ['Pôster Floresta Mágica', 'Pôsteres', 'Natureza', 'A3 · papel couché', 34.9, 9],
    ['Caneca Mascote Anime', 'Canecas', 'Anime', 'Mágica · 300 ml', 59.9, 6],
    ['Camiseta Foguete', 'Camisetas', 'Espaço', 'Algodão · P ao GG', 79.9, 14],
  ].map(([nome, categoria, tema, conteudo, preco, estoque], i) => ({ id: i + 1, nome, categoria, tema, conteudo, preco, estoque }));

  const corTema = (t) => temas.find((x) => x.nome === t)?.cor || '#64748b';
  const reais = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Desenho do objeto (por categoria) + emblema do tema.
  const objetos = {
    Camisetas: '<path d="M70 52 88 42h24l18 10 16 22-18 10-6-8v66H78V76l-6 8-18-10z" fill="#fff"/><path d="M88 42c4 9 20 9 24 0" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="3"/>',
    Canecas: '<rect x="62" y="56" width="62" height="78" rx="8" fill="#fff"/><path d="M124 74h10a14 14 0 0 1 0 28h-10" fill="none" stroke="#fff" stroke-width="9"/><rect x="62" y="56" width="62" height="12" rx="6" fill="rgba(0,0,0,.08)"/>',
    Chaveiros: '<circle cx="100" cy="50" r="14" fill="none" stroke="#fff" stroke-width="6"/><rect x="72" y="66" width="56" height="76" rx="14" fill="#fff"/>',
    Adesivos: '<path d="M64 52h72v58l-30 30H64z" fill="#fff"/><path d="M136 110h-24a6 6 0 0 0-6 6v24z" fill="rgba(0,0,0,.18)"/>',
    'Pôsteres': '<rect x="62" y="40" width="76" height="104" rx="4" fill="#fff"/><path d="M68 132l22-32 14 18 10-12 18 26z" fill="rgba(0,0,0,.14)"/><circle cx="118" cy="62" r="8" fill="rgba(0,0,0,.14)"/>',
  };
  const emblemas = {
    Games: '<rect x="-14" y="-8" width="28" height="16" rx="8" fill="currentColor"/><circle cx="6" cy="0" r="2.4" fill="#fff"/><path d="M-9 0h6M-6-3v6" stroke="#fff" stroke-width="2"/>',
    Anime: '<path d="M2-13-8 2h7l-3 11L8-3H1z" fill="currentColor"/>',
    'Retrô': '<path d="M-10-4h4v-4h4v4h4v-4h4v4h4v6h-4v4h-4v4h-4v-4h-4V2h-4z" fill="currentColor"/>',
    'Espaço': '<path d="M0-12l3.2 8 8.6.6-6.6 5.6 2.1 8.4L0 6l-7.3 4.6 2.1-8.4-6.6-5.6 8.6-.6z" fill="currentColor"/>',
    Natureza: '<path d="M-9 10C-11-4 0-12 11-11 12 2 2 12-9 10zM-9 10 5-4" fill="currentColor" stroke="#fff" stroke-width="1.6"/>',
  };

  function arte(p) {
    const cor = corTema(p.tema);
    return `<svg viewBox="0 0 200 180" role="img" aria-label="${p.nome}" preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id="g${p.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity=".22"/><stop offset="1" stop-color="${cor}" stop-opacity=".55"/></linearGradient></defs>
      <rect width="200" height="180" fill="${cor}"/><rect width="200" height="180" fill="url(#g${p.id})"/>
      <circle cx="160" cy="28" r="46" fill="#fff" opacity=".12"/><circle cx="30" cy="160" r="38" fill="#fff" opacity=".10"/>
      <g transform="translate(0 4)">${objetos[p.categoria]}</g>
      <g transform="translate(100 96)" color="${cor}">${emblemas[p.tema]}</g>
    </svg>`;
  }

  const logo = (cor = 'currentColor') => `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="${cor}"/><path d="M11 11h6v6h-6zM17 17h6v6h-6zM23 11h6v6h-6zM11 23h6v6h-6zM23 23h6v6h-6z" fill="#fff"/></svg>`;

  const icones = {
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 8.5c0 3.5 2.9 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2z"/></svg>',
    busca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    filtro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>',
    seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
    fechar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  };

  return { loja, categorias, temas, produtos, corTema, reais, arte, logo, icones };
})();
