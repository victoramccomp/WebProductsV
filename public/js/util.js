// Funções compartilhadas entre catálogo e painel.

export const formatarReais = (centavos) =>
  (Number(centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Escapa texto para inserir com segurança em innerHTML. */
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Texto sem acentos e em minúsculas, para buscas: "Pokémon" -> "pokemon". */
export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const slugify = (s) => semAcento(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

export function avisar(mensagem, tipo = 'normal') {
  let pilha = document.querySelector('.avisos');
  if (!pilha) {
    pilha = document.createElement('div');
    pilha.className = 'avisos';
    pilha.setAttribute('role', 'status');
    pilha.setAttribute('aria-live', 'polite');
    document.body.append(pilha);
  }
  const aviso = document.createElement('div');
  aviso.className = `aviso${tipo === 'erro' ? ' aviso-erro' : ''}`;
  aviso.textContent = mensagem;
  pilha.append(aviso);
  setTimeout(() => aviso.remove(), tipo === 'erro' ? 5000 : 2800);
}

/** Iniciais para o quadro de produto sem imagem: "Café Torrado" -> "CT". */
export function iniciais(nome) {
  return String(nome || '?').split(/\s+/).filter((p) => p.length > 2 || /^\d/.test(p))
    .slice(0, 2).map((p) => p[0]).join('').toUpperCase() || String(nome || '?')[0].toUpperCase();
}

export function imagemProduto(produto, classe = '') {
  if (produto.imagem) {
    return `<img class="${classe}" src="${esc(produto.imagem)}" alt="${esc(produto.nome)}" loading="lazy"
      data-reserva="${esc(iniciais(produto.nome))}">`;
  }
  return `<div class="sem-imagem ${classe}" aria-hidden="true">${esc(iniciais(produto.nome))}</div>`;
}

// Se uma imagem falhar (URL quebrada), troca pelo quadro com as iniciais.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.reserva === undefined) return;
  const quadro = document.createElement('div');
  quadro.className = `sem-imagem ${img.className}`;
  quadro.textContent = img.dataset.reserva;
  img.replaceWith(quadro);
}, true);

/** Máscara (11) 98888-7777 enquanto digita. */
export function mascararTelefone(valor) {
  const d = String(valor).replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** localStorage que não quebra em aba anônima/bloqueada. */
export const armazenamento = {
  ler(chave, padrao) {
    try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
  },
  gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
  },
};

/** Atraso para não reagir a cada tecla. */
export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Ícones SVG (traço) usados nas duas telas.
const caminhos = {
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  seta: '<path d="m9 6 6 6-6 6"/>',
  filtro: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
  sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
  caixa: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  pincel: '<path d="M14.5 4.5 19.5 9.5 11 18l-5-5z"/><path d="M6 13c-2 0-3 1.5-3 3.5S2 20 2 20s3.5.5 5-1 1.5-3 .5-4.5"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  loja: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M10 20v-5h4v5"/>',
  imagem: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
  whatsapp: '<path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 8.5c0 3.5 2.9 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2z"/>',
  facebook: '<path d="M14 21v-8h3l.5-3.5H14V7.8c0-1 .3-1.8 1.8-1.8h1.8V3a24 24 0 0 0-2.6-.1C12.4 2.9 10.6 4.5 10.6 7.4v2.1H7.7V13h2.9v8"/>',
  tiktok: '<path d="M14 3v12.2a3.8 3.8 0 1 1-3.8-3.8"/><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"/>',
};
export const icone = (nome, classe = 'icone') =>
  `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminhos[nome] || ''}</svg>`;
