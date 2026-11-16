// Idiomas dos produtos, com bandeiras desenhadas em SVG.
// (Emojis de bandeira não aparecem no Windows, por isso as bandeiras são desenhos próprios.)
// Para incluir um idioma: adicione aqui E na lista do check em supabase/schema.sql.
import { esc } from './util.js';

export const IDIOMA_PADRAO = 'pt-BR';

export const IDIOMAS = [
  { codigo: 'ja', nome: 'Japonês', curto: 'Japonês', sigla: 'JP', bandeira: 'jp' },
  { codigo: 'en', nome: 'Inglês (EUA)', curto: 'Inglês', sigla: 'EN', bandeira: 'us' },
  { codigo: 'de', nome: 'Alemão', curto: 'Alemão', sigla: 'DE', bandeira: 'de' },
  { codigo: 'fr', nome: 'Francês', curto: 'Francês', sigla: 'FR', bandeira: 'fr' },
  { codigo: 'it', nome: 'Italiano', curto: 'Italiano', sigla: 'IT', bandeira: 'it' },
  { codigo: 'pt-BR', nome: 'Português (Brasil)', curto: 'Português BR', sigla: 'PT-BR', bandeira: 'br' },
  { codigo: 'es-ES', nome: 'Espanhol (Espanha)', curto: 'Espanhol (ES)', sigla: 'ES', bandeira: 'es' },
  { codigo: 'es-419', nome: 'Espanhol (América Latina)', curto: 'Espanhol LatAm', sigla: 'ES-LA', bandeira: 'mx' },
  { codigo: 'ko', nome: 'Coreano (Coreia do Sul)', curto: 'Coreano', sigla: 'KR', bandeira: 'kr' },
  { codigo: 'zh-Hant', nome: 'Chinês tradicional (Hong Kong e Taiwan)', curto: 'Chinês trad.', sigla: 'ZH-T', bandeira: 'hktw' },
  { codigo: 'zh-Hans', nome: 'Chinês simplificado (China continental)', curto: 'Chinês simpl.', sigla: 'ZH-S', bandeira: 'cn' },
  { codigo: 'th', nome: 'Tailandês', curto: 'Tailandês', sigla: 'TH', bandeira: 'th' },
  { codigo: 'id', nome: 'Indonésio', curto: 'Indonésio', sigla: 'ID', bandeira: 'id' },
];

const POR_CODIGO = new Map(IDIOMAS.map((i) => [i.codigo, i]));
/** Idioma pelo código; produtos antigos (sem idioma) contam como o padrão. */
export const idiomaDe = (codigo) => POR_CODIGO.get(codigo) || POR_CODIGO.get(IDIOMA_PADRAO);

// ---------------------------------------------------------------- Desenhos (área 30 × 20)
function estrela(cx, cy, r, pontas = 5, interno = 0.382) {
  const pontos = [];
  for (let i = 0; i < pontas * 2; i += 1) {
    const raio = i % 2 ? r * interno : r;
    const a = ((-90 + (i * 180) / pontas) * Math.PI) / 180;
    pontos.push(`${(cx + raio * Math.cos(a)).toFixed(2)},${(cy + raio * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pontos.join(' ')}"/>`;
}
const faixasH = (...cores) => cores.map((c, i) => `<rect y="${(20 / cores.length) * i}" width="30" height="${20 / cores.length + 0.01}" fill="${c}"/>`).join('');
const faixasV = (...cores) => cores.map((c, i) => `<rect x="${(30 / cores.length) * i}" width="${30 / cores.length + 0.01}" height="20" fill="${c}"/>`).join('');
const trigrama = (x) => [0, 1, 2].map((n) => `<rect x="${x + n}" y="8" width=".6" height="4"/>`).join('');
// EUA: 13 listras e 50 estrelas (9 fileiras alternando 6 e 5) no cantão azul.
const listrasEua = Array.from({ length: 6 }, (_, i) => `<rect y="${((2 * i + 1) * 20) / 13}" width="30" height="${20 / 13}"/>`).join('');
const estrelasEua = Array.from({ length: 9 }, (_, linha) => {
  const y = (1.077 * (linha + 1)).toFixed(2);
  const xs = linha % 2 ? [2, 4, 6, 8, 10] : [1, 3, 5, 7, 9, 11];
  return xs.map((x) => `<circle cx="${x}" cy="${y}" r=".38"/>`).join('');
}).join('');
const petalas = (cx, cy) => [0, 72, 144, 216, 288]
  .map((g) => `<ellipse cx="${cx}" cy="${cy - 1.7}" rx="1" ry="1.9" transform="rotate(${g} ${cx} ${cy})"/>`).join('');

const DESENHOS = {
  jp: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  us: `<rect width="30" height="20" fill="#b22234"/><g fill="#fff">${listrasEua}</g>
    <rect width="12" height="10.77" fill="#3c3b6e"/><g fill="#fff">${estrelasEua}</g>`,
  de: faixasH('#000', '#dd0000', '#ffce00'),
  fr: faixasV('#0055a4', '#fff', '#ef4135'),
  it: faixasV('#009246', '#fff', '#ce2b37'),
  br: `<rect width="30" height="20" fill="#009c3b"/><path d="M15,2.2 27.6,10 15,17.8 2.4,10Z" fill="#ffdf00"/>
    <circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6,8.9Q15,7.6 19.5,10.9" stroke="#fff" stroke-width=".9" fill="none"/>`,
  es: '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>',
  mx: `${faixasV('#006847', '#fff', '#ce1126')}<circle cx="15" cy="9.6" r="2.3" fill="#8c5b2d"/>
    <path d="M12.6,11Q15,13.9 17.4,11" stroke="#006847" stroke-width=".7" fill="none"/>`,
  kr: `<rect width="30" height="20" fill="#fff"/>
    <g transform="rotate(33.7 15 10)"><circle cx="15" cy="10" r="5" fill="#0047a0"/>
      <path d="M10,10A5,5 0 0 1 20,10A2.5,2.5 0 0 1 15,10A2.5,2.5 0 0 0 10,10Z" fill="#cd2e3a"/>
      <g fill="#000">${trigrama(5.8)}${trigrama(21.6)}</g></g>
    <g transform="rotate(-33.7 15 10)" fill="#000">${trigrama(5.8)}${trigrama(21.6)}</g>`,
  // Hong Kong (embaixo) e Taiwan (em cima), divididos na diagonal.
  hktw: `<rect width="30" height="20" fill="#de2910"/><g fill="#fff">${petalas(21, 13.6)}</g>
    <polygon points="0,0 30,0 0,20" fill="#fe0000"/><rect width="15" height="10" fill="#000095"/>
    <g fill="#fff">${estrela(7.5, 5, 3.4, 12, 0.62)}</g><circle cx="7.5" cy="5" r="1.9" fill="#000095"/><circle cx="7.5" cy="5" r="1.55" fill="#fff"/>
    <path d="M30,0 0,20" stroke="#fff" stroke-width=".8"/>`,
  cn: `<rect width="30" height="20" fill="#ee1c25"/><g fill="#ffde00">${estrela(5, 5, 3)}${estrela(10, 2, 1)}${estrela(12, 4, 1)}${estrela(12, 7, 1)}${estrela(10, 9, 1)}</g>`,
  th: '<rect width="30" height="20" fill="#a51931"/><rect y="3.33" width="30" height="13.34" fill="#f4f5f8"/><rect y="6.67" width="30" height="6.66" fill="#2d2a4a"/>',
  id: '<rect width="30" height="20" fill="#fff"/><rect width="30" height="10" fill="#ce1126"/>',
};

/** SVG da bandeira do idioma. Decorativa: o nome do idioma deve aparecer em texto ao lado (ou em title). */
export function bandeira(codigo, classe = 'bandeira') {
  const idioma = idiomaDe(codigo);
  return `<svg class="${classe}" viewBox="0 0 30 20" aria-hidden="true" focusable="false">${DESENHOS[idioma.bandeira]}</svg>`;
}

/** Selo compacto: bandeira + sigla (ex.: 🇯🇵 JP), com o nome completo para leitores de tela. */
export function seloIdioma(codigo, classe = 'selo-idioma') {
  const idioma = idiomaDe(codigo);
  return `<span class="${classe}" title="${esc(idioma.nome)}">${bandeira(idioma.codigo)}<span aria-hidden="true">${esc(idioma.sigla)}</span><span class="sr-only">Idioma: ${esc(idioma.nome)}</span></span>`;
}
