// Painel › Aparência da loja: nome, slogan, logo, cor da marca e redes sociais (com prévia ao vivo).
import { rest, storage } from './supabase.js';
import { avisar, esc, icone, mascararTelefone } from './util.js';
import { redimensionarImagem } from './admin-ui.js';
import { LOJA_PADRAO, aplicarCores, contraste, logoHtml, redesHtml } from './loja.js';

const CORES_SUGERIDAS = ['#4f46e5', '#2563eb', '#0d9488', '#16a34a', '#d97706', '#e8590c', '#e3350d', '#db2777', '#7c3aed', '#0f172a'];

/** "5511988887777" -> "(11) 98888-7777" para mostrar no campo. */
const whatsParaCampo = (d) => mascararTelefone(String(d || '').replace(/^55(?=\d{10,11}$)/, ''));

/** Campo -> só dígitos com DDI. Retorna null se inválido. */
function campoParaWhats(valor) {
  const d = String(valor).replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12 && d.length <= 15) return d;
  return null;
}

export async function vistaAparencia(v, { aoSalvar }) {
  const [linha] = await rest('loja?select=*&id=eq.1', { admin: true });
  const salvo = { ...LOJA_PADRAO, ...linha };
  // logo: URL salva, '' (sem logo) ou { blob, previa } (arquivo novo, enviado ao salvar)
  let logo = salvo.logo_url;

  v.innerHTML = `
    <div class="cabecalho"><div><h1>Aparência da loja</h1><p>Como a loja aparece para os clientes no catálogo.</p></div></div>
    <div class="aparencia">
      <form class="secoes-config" id="form-loja" novalidate>
        <section class="secao">
          <h2>Identidade</h2>
          <label class="campo"><span class="obrigatorio">Nome da loja</span>
            <input class="input" name="nome" maxlength="80" required value="${esc(salvo.nome)}"></label>
          <label class="campo"><span>Slogan</span>
            <input class="input" name="slogan" maxlength="140" placeholder="Ex.: Cartas e colecionáveis originais" value="${esc(salvo.slogan)}"></label>
          <div class="campo">
            <span class="rotulo">Logo</span>
            <div class="logo-campo">
              <div class="logo-previa" id="logo-previa"></div>
              <div class="logo-botoes">
                <button class="btn" type="button" id="escolher-logo">${icone('imagem')} Enviar logo</button>
                <button class="btn btn-fantasma btn-perigo" type="button" id="remover-logo">Remover</button>
                <small>PNG com fundo transparente fica melhor. Sem logo, aparecem as iniciais da loja.</small>
              </div>
              <input type="file" id="arquivo-logo" accept="image/png,image/jpeg,image/webp" hidden>
            </div>
          </div>
        </section>

        <section class="secao">
          <h2>Cor da marca</h2>
          <p>Usada em botões, filtro ativo e destaques. O texto sobre ela fica claro ou escuro automaticamente.</p>
          <div class="cores">
            ${CORES_SUGERIDAS.map((c) => `<button type="button" class="amostra" data-cor="${c}" style="--c:${c}" aria-label="Usar a cor ${c}"></button>`).join('')}
            <label class="cor-livre" title="Escolher outra cor"><input type="color" id="seletor-cor" value="${esc(salvo.cor_primaria)}"><span>Outra</span></label>
            <input class="input hex" name="cor_primaria" maxlength="7" value="${esc(salvo.cor_primaria)}" aria-label="Código da cor (hexadecimal)">
          </div>
          <p class="dica-campo" id="dica-cor"></p>
        </section>

        <section class="secao">
          <h2>Redes sociais e contato</h2>
          <p>Aparecem no topo e no rodapé do catálogo. Deixe em branco o que não usar.</p>
          <div class="grade-campos">
            <label class="campo"><span>Instagram</span>
              <input class="input" name="instagram" maxlength="200" placeholder="@sualoja" value="${esc(salvo.instagram)}"></label>
            <label class="campo"><span>WhatsApp</span>
              <input class="input" name="whatsapp" type="tel" inputmode="tel" placeholder="(11) 98888-7777" value="${esc(whatsParaCampo(salvo.whatsapp))}">
              <small>Também ativa o botão “Pedir pelo WhatsApp” em cada produto.</small></label>
            <label class="campo"><span>Facebook</span>
              <input class="input" name="facebook" maxlength="200" placeholder="nome da página ou link" value="${esc(salvo.facebook)}"></label>
            <label class="campo"><span>TikTok</span>
              <input class="input" name="tiktok" maxlength="200" placeholder="@sualoja" value="${esc(salvo.tiktok)}"></label>
          </div>
        </section>

        <div class="barra-salvar">
          <button class="btn btn-primario" type="submit" id="salvar-loja">Salvar aparência</button>
        </div>
      </form>

      <aside class="previa-loja" aria-label="Prévia do catálogo">
        <span class="rotulo">Prévia</span>
        <div class="previa-janela" id="previa"></div>
      </aside>
    </div>`;

  const form = v.querySelector('#form-loja');
  const $v = (sel) => v.querySelector(sel);

  function dadosDoForm() {
    const cor = /^#[0-9a-f]{6}$/i.test(form.cor_primaria.value) ? form.cor_primaria.value : salvo.cor_primaria;
    return {
      nome: form.nome.value.trim() || 'Minha Loja', slogan: form.slogan.value.trim(), cor_primaria: cor.toLowerCase(),
      instagram: form.instagram.value.trim(), whatsapp: campoParaWhats(form.whatsapp.value) ?? '',
      facebook: form.facebook.value.trim(), tiktok: form.tiktok.value.trim(),
      logo_url: typeof logo === 'object' ? logo.previa : logo,
    };
  }

  function atualizarPrevia() {
    const d = dadosDoForm();
    const previa = $v('#previa');
    aplicarCores(d.cor_primaria, previa);
    previa.innerHTML = `
      <div class="pv-topo">
        ${logoHtml(d)}
        <div class="pv-textos"><strong>${esc(d.nome)}</strong>${d.slogan ? `<small>${esc(d.slogan)}</small>` : ''}</div>
      </div>
      <div class="pv-redes">${redesHtml(d) || '<span class="pv-sem-redes">Nenhuma rede informada</span>'}</div>
      <div class="pv-corpo">
        <div class="pv-filtros"><span class="pv-ativo">Todos os produtos</span><span>Categoria</span><span>Categoria</span></div>
        <div class="pv-card">
          <div class="pv-imagem"></div>
          <span class="pv-linha curta"></span><span class="pv-linha"></span>
          <strong>R$ 99,90</strong>
          <span class="btn btn-marca btn-pequeno">${icone('whatsapp')} Pedir pelo WhatsApp</span>
        </div>
      </div>`;
    $v('#logo-previa').innerHTML = logoHtml(d, 'logo logo-grande');
    $v('#remover-logo').hidden = !d.logo_url;
    v.querySelectorAll('.amostra').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cor === d.cor_primaria));
    $v('#seletor-cor').value = d.cor_primaria;
    // Aviso se a cor for muito clara para ser usada como texto em fundo branco.
    const dica = $v('#dica-cor');
    const fraco = contraste(d.cor_primaria, '#ffffff') < 3;
    dica.className = `dica-campo${fraco ? ' alerta' : ''}`;
    dica.textContent = fraco ? 'Cor bem clara: nos textos ela será escurecida automaticamente para continuar legível.' : '';
  }

  // ---- Cor
  v.querySelectorAll('.amostra').forEach((b) => b.addEventListener('click', () => { form.cor_primaria.value = b.dataset.cor; atualizarPrevia(); }));
  $v('#seletor-cor').addEventListener('input', (e) => { form.cor_primaria.value = e.target.value; atualizarPrevia(); });
  form.cor_primaria.addEventListener('input', atualizarPrevia);

  // ---- Logo
  const trocarLogo = (novo) => {
    if (typeof logo === 'object') URL.revokeObjectURL(logo.previa);
    logo = novo;
    atualizarPrevia();
  };
  $v('#escolher-logo').addEventListener('click', () => $v('#arquivo-logo').click());
  $v('#arquivo-logo').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    try {
      const blob = await redimensionarImagem(arquivo, { tamanhoMax: 512, fundoBranco: false });
      trocarLogo({ blob, previa: URL.createObjectURL(blob) });
    } catch (erro) { avisar(erro.message, 'erro'); }
  });
  $v('#remover-logo').addEventListener('click', () => trocarLogo(''));

  // ---- Demais campos
  form.whatsapp.addEventListener('input', (e) => { e.target.value = mascararTelefone(e.target.value); });
  form.addEventListener('input', (e) => { if (e.target.name && e.target.name !== 'cor_primaria') atualizarPrevia(); });
  atualizarPrevia();

  // ---- Salvar
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.nome.value.trim()) { avisar('Informe o nome da loja.', 'erro'); form.nome.focus(); return; }
    if (!/^#[0-9a-f]{6}$/i.test(form.cor_primaria.value)) { avisar('Cor inválida. Use o formato #RRGGBB.', 'erro'); form.cor_primaria.focus(); return; }
    const whatsapp = campoParaWhats(form.whatsapp.value);
    if (whatsapp === null) { avisar('WhatsApp inválido: informe DDD + número.', 'erro'); form.whatsapp.focus(); return; }

    const botao = $v('#salvar-loja');
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    let enviado = '';
    try {
      if (typeof logo === 'object') enviado = await storage.enviar(logo.blob, 'loja');
      const dados = { ...dadosDoForm(), whatsapp, logo_url: enviado || logo };
      const [atualizada] = await rest('loja?id=eq.1', { metodo: 'PATCH', admin: true, corpo: dados, prefer: 'return=representation' });
      if (salvo.logo_url && salvo.logo_url !== dados.logo_url) await storage.apagar(salvo.logo_url);
      Object.assign(salvo, atualizada);
      logo = salvo.logo_url;
      aoSalvar({ ...LOJA_PADRAO, ...atualizada });
      atualizarPrevia();
      avisar('Aparência salva. O catálogo já mostra as mudanças.');
    } catch (erro) {
      if (enviado) await storage.apagar(enviado);
      avisar(erro.message, 'erro');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Salvar aparência';
    }
  });
}
