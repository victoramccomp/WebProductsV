// Identidade visual da loja: cor da marca, logo e links das redes sociais.
import { esc, icone } from './util.js';

export const LOJA_PADRAO = {
  nome: 'Minha Loja', slogan: '', logo_url: '', cor_primaria: '#4f46e5',
  instagram: '', whatsapp: '', facebook: '', tiktok: '',
};

// ---------------------------------------------------------------- Cores
const hexParaRgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbParaHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function luminancia(hex) {
  const [r, g, b] = hexParaRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const misturar = (hex, alvo, peso) => {
  const [a, b] = [hexParaRgb(hex), hexParaRgb(alvo)];
  return rgbParaHex(a.map((v, i) => v + (b[i] - v) * peso));
};
/** Escurece (ou clareia) a cor até ter contraste mínimo com o fundo. */
function legivelSobre(hex, fundo, minimo = 4.5) {
  const alvo = luminancia(fundo) > 0.5 ? '#000000' : '#ffffff';
  for (let peso = 0; peso <= 1; peso += 0.05) {
    const cor = misturar(hex, alvo, peso);
    if (contraste(cor, fundo) >= minimo) return cor;
  }
  return alvo;
}

/** Aplica a cor da marca em variáveis CSS (com versões legíveis para tema claro e escuro). */
export function aplicarCores(cor, alvo = document.documentElement) {
  const hex = /^#[0-9a-f]{6}$/i.test(cor || '') ? cor : LOJA_PADRAO.cor_primaria;
  alvo.style.setProperty('--marca', hex);
  // Texto sobre botão da cor da marca: branco ou quase preto, o que tiver mais contraste.
  alvo.style.setProperty('--marca-contraste', contraste(hex, '#ffffff') >= contraste(hex, '#0f172a') ? '#ffffff' : '#0f172a');
  // A marca usada como cor de texto/realce, ajustada para ficar legível em cada tema.
  alvo.style.setProperty('--marca-tinta-claro', legivelSobre(hex, '#ffffff'));
  alvo.style.setProperty('--marca-tinta-escuro', legivelSobre(hex, '#111827'));
}

// ---------------------------------------------------------------- Logo
/** Logo da loja (imagem enviada) ou um monograma na cor da marca. */
export function logoHtml(loja, classe = 'logo') {
  if (loja.logo_url) return `<img class="${classe}" src="${esc(loja.logo_url)}" alt="">`;
  const letras = String(loja.nome || 'L').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return `<span class="${classe} logo-monograma" aria-hidden="true">${esc(letras)}</span>`;
}

// ---------------------------------------------------------------- Redes sociais
const usuarioDe = (valor) => String(valor || '').trim().replace(/^@/, '').replace(/\/+$/, '');
const ehUrl = (v) => /^https?:\/\//i.test(v);

/** Normaliza o que o lojista digitou (@perfil, perfil ou link) em { url, rotulo }. */
export function redesDaLoja(loja) {
  const redes = [];
  if (loja.instagram) {
    const v = String(loja.instagram).trim();
    const user = ehUrl(v) ? usuarioDe(v.split('instagram.com/')[1] || '') : usuarioDe(v);
    redes.push({ rede: 'instagram', nome: 'Instagram', url: ehUrl(v) ? v : `https://www.instagram.com/${encodeURIComponent(user)}`, rotulo: user ? `@${user}` : 'Instagram' });
  }
  if (loja.whatsapp) {
    redes.push({ rede: 'whatsapp', nome: 'WhatsApp', url: `https://wa.me/${loja.whatsapp}`, rotulo: 'WhatsApp' });
  }
  if (loja.facebook) {
    const v = String(loja.facebook).trim();
    redes.push({ rede: 'facebook', nome: 'Facebook', url: ehUrl(v) ? v : `https://www.facebook.com/${encodeURIComponent(usuarioDe(v))}`, rotulo: 'Facebook' });
  }
  if (loja.tiktok) {
    const v = String(loja.tiktok).trim();
    const user = ehUrl(v) ? usuarioDe((v.split('tiktok.com/')[1] || '').replace(/^@/, '')) : usuarioDe(v);
    redes.push({ rede: 'tiktok', nome: 'TikTok', url: ehUrl(v) ? v : `https://www.tiktok.com/@${encodeURIComponent(user)}`, rotulo: user ? `@${user}` : 'TikTok' });
  }
  return redes;
}

/** Botões das redes: a primeira (normalmente o Instagram) fica em destaque com texto. */
export function redesHtml(loja) {
  return redesDaLoja(loja).map((r, i) => `
    <a class="rede${i === 0 ? ' rede-destaque' : ''}" href="${esc(r.url)}" target="_blank" rel="noopener"
       aria-label="${esc(r.nome)}${r.rotulo !== r.nome ? ` ${esc(r.rotulo)}` : ''}" title="${esc(r.nome)}">
      ${icone(r.rede)}${i < 2 ? `<span>${esc(r.rotulo)}</span>` : ''}
    </a>`).join('');
}

export const linkWhatsApp = (loja, texto) =>
  loja.whatsapp ? `https://wa.me/${loja.whatsapp}?text=${encodeURIComponent(texto)}` : '';
