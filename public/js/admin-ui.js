// Componentes de interface do painel: modal genérico, confirmação e pergunta de texto.
import { esc, icone } from './util.js';

const modal = () => document.getElementById('modal');

/** Abre o modal principal com título, corpo e rodapé (HTML). Retorna o elemento <dialog>. */
export function abrirModal({ titulo, corpo, rodape = '', aoFechar }) {
  const m = modal();
  m.innerHTML = `
    <div class="modal-topo">
      <h2>${esc(titulo)}</h2>
      <button class="btn btn-fantasma btn-icone" type="button" data-fechar aria-label="Fechar">${icone('fechar')}</button>
    </div>
    <div class="modal-corpo">${corpo}</div>
    ${rodape ? `<div class="modal-rodape">${rodape}</div>` : ''}`;
  m.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => m.close()));
  m.onclose = () => aoFechar?.();
  m.showModal();
  return m;
}

export const fecharModal = () => modal().open && modal().close();

/** Diálogo de confirmação. Resolve true/false. */
export function confirmar({ titulo, mensagem, botao = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    const d = document.getElementById('modal-confirmar');
    d.innerHTML = `
      <form method="dialog">
        <div class="modal-topo"><h2>${esc(titulo)}</h2></div>
        <div class="modal-corpo"><p>${esc(mensagem)}</p></div>
        <div class="modal-rodape">
          <button class="btn" value="nao">Cancelar</button>
          <button class="btn ${perigo ? 'btn-perigo' : 'btn-primario'}" value="sim" autofocus>${esc(botao)}</button>
        </div>
      </form>`;
    d.onclose = () => resolve(d.returnValue === 'sim');
    d.returnValue = '';
    d.showModal();
  });
}

/** Pergunta um texto (ex.: renomear). Resolve com o texto ou null. */
export function pedirTexto({ titulo, rotulo, valor = '', botao = 'Salvar' }) {
  return new Promise((resolve) => {
    const d = document.getElementById('modal-confirmar');
    d.innerHTML = `
      <form method="dialog">
        <div class="modal-topo"><h2>${esc(titulo)}</h2></div>
        <div class="modal-corpo">
          <label class="campo"><span>${esc(rotulo)}</span>
            <input class="input" name="texto" value="${esc(valor)}" maxlength="60" required autofocus>
          </label>
        </div>
        <div class="modal-rodape">
          <button class="btn" value="nao" formnovalidate>Cancelar</button>
          <button class="btn btn-primario" value="sim">${esc(botao)}</button>
        </div>
      </form>`;
    const input = d.querySelector('input');
    d.onclose = () => resolve(d.returnValue === 'sim' && input.value.trim() ? input.value.trim() : null);
    d.returnValue = '';
    d.showModal();
    input.select();
  });
}

/** Converte "1.234,56" ou "12,5" em centavos. Retorna NaN se inválido. */
export function reaisParaCentavos(texto) {
  const limpo = String(texto).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  if (!limpo) return NaN;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}

export const centavosParaTexto = (c) =>
  (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Confere o dígito verificador de EAN-8/UPC-A/EAN-13/GTIN-14. */
export function gtinValido(codigo) {
  if (!/^(\d{8}|\d{12,14})$/.test(codigo)) return false;
  const digitos = [...codigo].map(Number);
  const verificador = digitos.pop();
  const soma = digitos.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === verificador;
}

export function formatarData(textoSql) {
  // O SQLite grava em UTC ("2026-10-02 19:39:53").
  const data = new Date(`${textoSql.replace(' ', 'T')}Z`);
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const STATUS = {
  pendente: { nome: 'Pendente', selo: 'selo-alerta' },
  em_analise: { nome: 'Em análise', selo: 'selo-info' },
  aprovado: { nome: 'Aprovado', selo: 'selo-sucesso' },
  cancelado: { nome: 'Cancelado', selo: 'selo-perigo' },
};
export const seloStatus = (s) => `<span class="selo ${STATUS[s]?.selo || ''}">${esc(STATUS[s]?.nome || s)}</span>`;
