const hoje = () => new Date().toLocaleDateString('sv');
const $ = (id) => document.getElementById(id);

async function iniciar() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = aba?.url?.startsWith('http') ? new URL(aba.url).hostname : '';
  const local = await chrome.storage.local.get(['chave', 'uso', 'cota', 'sitesExcluidos']);
  const { abasPausadas = [] } = await chrome.storage.session.get('abasPausadas');
  const sitesExcluidos = local.sitesExcluidos || [];
  const excluido = sitesExcluidos.includes(host);

  $('semChave').hidden = Boolean(local.chave);
  $('cota').hidden = local.cota?.data !== hoje();
  $('chamadas').textContent = local.uso?.data === hoje() ? String(local.uso.chamadas) : '0';
  $('precos').href = RevisorConfig.PRECOS_URL;
  $('hostAtual').textContent = host || 'Página sem campos revisáveis';

  const alternador = $('abaAtiva');
  alternador.checked = Boolean(host) && !excluido && !abasPausadas.includes(aba?.id);
  alternador.disabled = !host || excluido;
  alternador.addEventListener('change', () => {
    chrome.runtime.sendMessage({ tipo: 'pausar', abaId: aba.id, pausado: !alternador.checked });
  });

  const pedirRevisao = $('pedirRevisao');
  pedirRevisao.hidden = !alternador.checked;
  pedirRevisao.addEventListener('click', async () => {
    await chrome.tabs.sendMessage(aba.id, { tipo: 'revisarPedido' }).catch(() => {});
    window.close();
  });

  const botaoSite = $('site');
  botaoSite.hidden = !host;
  botaoSite.textContent = excluido ? `Voltar a revisar em ${host}` : `Não revisar em ${host}`;
  botaoSite.addEventListener('click', async () => {
    const lista = excluido ? sitesExcluidos.filter((s) => s !== host) : [...sitesExcluidos, host];
    await chrome.storage.local.set({ sitesExcluidos: lista });
    window.close();
  });

  const abrirOpcoes = (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  };
  $('opcoes').addEventListener('click', abrirOpcoes);
  $('configurarChave').addEventListener('click', abrirOpcoes);

  if (RevisorConfig.DOACAO_URL) {
    $('doacao').href = RevisorConfig.DOACAO_URL;
    $('doacao').hidden = false;
  }
}

iniciar();
