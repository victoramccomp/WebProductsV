// Dados do seu projeto Supabase.
// Onde encontrar: painel do Supabase → Project Settings → API Keys (ou botão "Connect").
//   supabaseUrl: "Project URL"  (ex.: https://abcdefghijkl.supabase.co)
//   supabaseKey: chave pública — "Publishable key" (sb_publishable_...) ou a antiga "anon public"
// Essas duas informações são públicas por natureza (vão para o navegador).
// NUNCA coloque aqui a "Secret key" / "service_role".
export const CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseKey: 'SUA_CHAVE_PUBLICA',
};

// Para testar com o Supabase local (npx supabase start), abra o site com ?local=1 uma vez.
// A escolha fica salva neste navegador; ?local=0 volta para o projeto acima.
const LOCAL = {
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', // chave padrão do Supabase local
};
try {
  const escolha = new URLSearchParams(location.search).get('local');
  if (escolha !== null) localStorage.setItem('wpv_local', escolha === '1' ? '1' : '0');
  if (['localhost', '127.0.0.1'].includes(location.hostname) && localStorage.getItem('wpv_local') === '1') {
    Object.assign(CONFIG, LOCAL);
  }
} catch { /* sem localStorage: usa o projeto configurado */ }
